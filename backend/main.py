from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from src.bpm_tap_sync.config import settings
from src.bpm_tap_sync.engine import TempoEngine, TempoState
from src.bpm_tap_sync.osc import OscOut, Outputs

app = FastAPI()

# CORS for local frontend dev server (same style as your other repo)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# OSC outputs
outputs = Outputs(
    ma3=OscOut(settings.ma3_ip, settings.ma3_port),
    resolume=OscOut(settings.resolume_ip, settings.resolume_port),
    heavym=OscOut(settings.heavym_ip, settings.heavym_port),
)

clients: set[WebSocket] = set()
metronome_enabled = False
round_whole_bpm = True
control_lock = asyncio.Lock()


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    raise ValueError("Expected boolean or 0/1")


def _state_payload(state: TempoState) -> dict[str, Any]:
    return {
        "type": "state",
        "bpm": state.bpm,
        "beat": state.beat,
        "bar": state.bar,
        "running": state.running,
        "metronome": metronome_enabled,
        "round_whole_bpm": round_whole_bpm,
    }


async def _broadcast_state_async(state: TempoState):
    payload = _state_payload(state)
    stale: list[WebSocket] = []

    for ws in list(clients):
        try:
            await ws.send_json(payload)
        except Exception:
            stale.append(ws)

    for ws in stale:
        clients.discard(ws)


def _broadcast_state(state: TempoState):
    loop = asyncio.get_running_loop()
    loop.create_task(_broadcast_state_async(state))


def _on_bpm(bpm: float):
    outputs.set_bpm(bpm)


def _on_beat(beat: int, bar: int):
    outputs.beat(beat, bar)


engine = TempoEngine(on_state=_broadcast_state, on_bpm=_on_bpm, on_beat=_on_beat)


@app.on_event("startup")
async def _startup():
    await engine.set_whole_bpm_rounding(round_whole_bpm)
    await engine.start()


@app.get("/api/health")
async def health():
    return JSONResponse({"ok": True})


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    global metronome_enabled, round_whole_bpm

    await ws.accept()
    clients.add(ws)

    s = await engine.get_state()
    await ws.send_json(_state_payload(s))

    try:
        while True:
            data = await ws.receive_text()
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                await ws.send_json({"type": "error", "message": "Invalid JSON"})
                continue

            if not isinstance(msg, dict):
                await ws.send_json({"type": "error", "message": "Message must be a JSON object"})
                continue

            t = msg.get("type")

            try:
                if t == "tap":
                    await engine.tap_bpm()
                elif t == "set_bpm":
                    await engine.set_bpm(float(msg["bpm"]))
                elif t == "nudge":
                    await engine.nudge(float(msg.get("delta", 0.0)))
                elif t == "preset":
                    await engine.set_bpm(float(msg["bpm"]))
                elif t == "resync":
                    outputs.resync()
                elif t == "toggle_metronome":
                    async with control_lock:
                        metronome_enabled = not metronome_enabled
                        enabled = metronome_enabled
                    outputs.set_metronome(enabled)
                    s = await engine.get_state()
                    await _broadcast_state_async(s)
                elif t == "set_metronome":
                    enabled = _coerce_bool(msg["enabled"])
                    async with control_lock:
                        metronome_enabled = enabled
                    outputs.set_metronome(enabled)
                    s = await engine.get_state()
                    await _broadcast_state_async(s)
                elif t == "toggle_bpm_rounding":
                    async with control_lock:
                        round_whole_bpm = not round_whole_bpm
                        enabled = round_whole_bpm
                    await engine.set_whole_bpm_rounding(enabled)
                    s = await engine.get_state()
                    await _broadcast_state_async(s)
                else:
                    await ws.send_json({"type": "error", "message": "Unknown message type"})
            except (KeyError, TypeError, ValueError):
                await ws.send_json({"type": "error", "message": "Invalid payload"})
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(ws)


# Frontend build mount (same style as your other repo)
FRONTEND_DIST = Path(__file__).parent / "frontend_dist"

if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")
else:
    @app.get("/", response_class=HTMLResponse)
    def placeholder_root():
        return """
        <html>
        <body style="font-family: sans-serif;">
            <h1>bpm-tap-sync Backend</h1>
            <p>Frontend build is missing. Copy <code>frontend/dist</code> to <code>backend/frontend_dist</code>.</p>
            <p>API docs: <a href="/docs">/docs</a></p>
        </body>
        </html>
        """


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)

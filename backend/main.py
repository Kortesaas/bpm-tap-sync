from __future__ import annotations

import asyncio
import json
from pathlib import Path

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


def _broadcast_state(state: TempoState):
    payload = {
        "type": "state",
        "bpm": state.bpm,
        "beat": state.beat,
        "bar": state.bar,
        "running": state.running,
    }
    msg = json.dumps(payload)

    loop = asyncio.get_event_loop()
    for ws in list(clients):
        loop.call_soon_threadsafe(asyncio.create_task, ws.send_text(msg))


def _on_bpm(bpm: float):
    outputs.set_bpm(bpm)


def _on_beat(beat: int, bar: int):
    outputs.beat(beat, bar)


engine = TempoEngine(on_state=_broadcast_state, on_bpm=_on_bpm, on_beat=_on_beat)


@app.on_event("startup")
async def _startup():
    await engine.start()


@app.get("/api/health")
async def health():
    return JSONResponse({"ok": True})


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)

    s = engine.state
    await ws.send_json(
        {"type": "state", "bpm": s.bpm, "beat": s.beat, "bar": s.bar, "running": s.running}
    )

    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            t = msg.get("type")

            if t == "tap":
                await engine.tap_bpm()
            elif t == "set_bpm":
                await engine.set_bpm(float(msg["bpm"]))
            elif t == "nudge":
                await engine.nudge(float(msg.get("delta", 0.0)))
            elif t == "preset":
                await engine.set_bpm(float(msg["bpm"]))
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

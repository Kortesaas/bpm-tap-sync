from __future__ import annotations

import asyncio
import ipaddress
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
    ma3_bpm_master=settings.ma3_bpm_master,
    heavym_bpm_address=settings.heavym_bpm_address,
    heavym_resync_address=settings.heavym_resync_address,
    heavym_bpm_min=settings.heavym_bpm_min,
    heavym_bpm_max=settings.heavym_bpm_max,
    heavym_resync_value=settings.heavym_resync_value,
    heavym_resync_send_zero=settings.heavym_resync_send_zero,
)

clients: set[WebSocket] = set()
metronome_enabled = False
round_whole_bpm = True
control_lock = asyncio.Lock()
OSC_TARGETS = {"ma3", "resolume", "heavym"}


def _coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, int) and value in (0, 1):
        return bool(value)
    raise ValueError("Expected boolean or 0/1")


def _coerce_output_target(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("Target must be a string")
    target = value.strip().lower()
    if target not in OSC_TARGETS:
        raise ValueError(f"Unknown OSC target: {target}")
    return target


def _coerce_ip(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("IP must be a string")
    ip = value.strip()
    ipaddress.ip_address(ip)
    return ip


def _coerce_port(value: Any) -> int:
    port = int(value)
    if not (1 <= port <= 65535):
        raise ValueError("Port must be in range 1..65535")
    return port


def _coerce_osc_address(value: Any) -> str:
    if not isinstance(value, str):
        raise ValueError("OSC address must be a string")
    address = value.strip()
    if not address or not address.startswith("/"):
        raise ValueError("OSC address must start with '/'")
    return address


def _coerce_float(value: Any) -> float:
    return float(value)


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


def _is_output_enabled(target: str) -> bool:
    snapshot = outputs.settings_snapshot()
    target_cfg = snapshot.get(target, {})
    return bool(target_cfg.get("enabled", False))


async def _sync_output_state(target: str):
    current_state = await engine.get_state()
    outputs.set_bpm_for_target(target, current_state.bpm)
    if target == "resolume":
        outputs.set_metronome(metronome_enabled)


def _settings_payload() -> dict[str, Any]:
    return {
        "type": "settings",
        "round_whole_bpm": round_whole_bpm,
        "outputs": outputs.settings_snapshot(),
        "ma3_osc": outputs.ma3_settings_snapshot(),
        "heavym_osc": outputs.heavym_settings_snapshot(),
    }


async def _broadcast_payload(payload: dict[str, Any]):
    stale: list[WebSocket] = []

    for ws in list(clients):
        try:
            await ws.send_json(payload)
        except Exception:
            stale.append(ws)

    for ws in stale:
        clients.discard(ws)


async def _broadcast_state_async(state: TempoState):
    await _broadcast_payload(_state_payload(state))


async def _broadcast_settings_async():
    await _broadcast_payload(_settings_payload())


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
    await ws.send_json(_settings_payload())

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
                    await engine.resync()
                    outputs.resync()
                elif t == "sync_bpm":
                    # Explicit manual sync: send current BPM to MA3 only.
                    current_state = await engine.get_state()
                    outputs.set_bpm_for_target("ma3", current_state.bpm)
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
                    await _broadcast_settings_async()
                elif t == "set_round_whole_bpm":
                    enabled = _coerce_bool(msg["enabled"])
                    async with control_lock:
                        round_whole_bpm = enabled
                    await engine.set_whole_bpm_rounding(enabled)
                    await _broadcast_settings_async()
                elif t == "set_output_enabled":
                    target = _coerce_output_target(msg["target"])
                    enabled = _coerce_bool(msg["enabled"])
                    outputs.set_output_enabled(target, enabled)
                    if enabled:
                        await _sync_output_state(target)
                    await _broadcast_settings_async()
                elif t == "set_output_target":
                    target = _coerce_output_target(msg["target"])
                    ip = _coerce_ip(msg["ip"])
                    port = _coerce_port(msg["port"])
                    outputs.set_output_target(target, ip, port)
                    if _is_output_enabled(target):
                        await _sync_output_state(target)
                    await _broadcast_settings_async()
                elif t == "set_ma3_osc":
                    primary_master = str(msg["primary_master"]) if "primary_master" in msg else None
                    extras_payload = msg.get("extras") if "extras" in msg else None
                    extras: list[dict[str, object]] | None = None
                    if extras_payload is not None:
                        if not isinstance(extras_payload, list):
                            raise ValueError("extras must be a list")
                        parsed: list[dict[str, object]] = []
                        for item in extras_payload:
                            if not isinstance(item, dict):
                                raise ValueError("extras entry must be object")
                            parsed.append(
                                {
                                    "master": str(item["master"]),
                                    "multiplier": float(item["multiplier"]),
                                }
                            )
                        extras = parsed
                    if primary_master is None and extras is None:
                        raise ValueError("No MA3 OSC settings provided")
                    outputs.set_ma3_osc(primary_master=primary_master, extras=extras)
                    if _is_output_enabled("ma3"):
                        await _sync_output_state("ma3")
                    await _broadcast_settings_async()
                elif t == "set_heavym_osc":
                    bpm_address = (
                        _coerce_osc_address(msg["bpm_address"]) if "bpm_address" in msg else None
                    )
                    resync_address = (
                        _coerce_osc_address(msg["resync_address"]) if "resync_address" in msg else None
                    )
                    bpm_min = _coerce_float(msg["bpm_min"]) if "bpm_min" in msg else None
                    bpm_max = _coerce_float(msg["bpm_max"]) if "bpm_max" in msg else None
                    resync_value = _coerce_float(msg["resync_value"]) if "resync_value" in msg else None
                    resync_send_zero = (
                        _coerce_bool(msg["resync_send_zero"]) if "resync_send_zero" in msg else None
                    )

                    if (
                        bpm_address is None
                        and resync_address is None
                        and bpm_min is None
                        and bpm_max is None
                        and resync_value is None
                        and resync_send_zero is None
                    ):
                        raise ValueError("No HeavyM OSC settings provided")

                    outputs.set_heavym_osc(
                        bpm_address=bpm_address,
                        resync_address=resync_address,
                        bpm_min=bpm_min,
                        bpm_max=bpm_max,
                        resync_value=resync_value,
                        resync_send_zero=resync_send_zero,
                    )
                    if _is_output_enabled("heavym"):
                        await _sync_output_state("heavym")
                    await _broadcast_settings_async()
                elif t == "test_heavym_bpm":
                    bpm = _coerce_float(msg.get("bpm", 120.0))
                    outputs.set_bpm_for_target("heavym", bpm)
                elif t == "test_heavym_sync":
                    outputs.trigger_resync_for_target("heavym")
                elif t == "get_settings":
                    await ws.send_json(_settings_payload())
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

from __future__ import annotations

import logging

from pythonosc.udp_client import SimpleUDPClient

logger = logging.getLogger(__name__)


def _clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


def _bpm_to_resolume_tempo_norm(bpm: float) -> float:
    # Resolume expects 0.0-1.0 mapped to roughly 20-500 BPM.
    min_bpm = 20.0
    max_bpm = 500.0
    bounded = _clamp(float(bpm), min_bpm, max_bpm)
    return (bounded - min_bpm) / (max_bpm - min_bpm)


def _compact_bpm_number(bpm: float) -> int | float:
    value = round(float(bpm), 3)
    as_int = round(value)
    if abs(value - as_int) < 1e-6:
        return int(as_int)
    return value


def _compact_bpm_text(bpm: float) -> str:
    value = round(float(bpm), 3)
    return f"{value:.3f}".rstrip("0").rstrip(".")


def _bpm_to_normalized_range(bpm: float, minimum_bpm: float, maximum_bpm: float) -> float:
    # HeavyM tempo mapping expects 0.0..1.0.
    min_bpm = float(minimum_bpm)
    max_bpm = float(maximum_bpm)
    if max_bpm <= min_bpm:
        raise ValueError("HeavyM BPM max must be greater than min")
    bounded = _clamp(float(bpm), min_bpm, max_bpm)
    return (bounded - min_bpm) / (max_bpm - min_bpm)


class OscOut:
    def __init__(self, ip: str, port: int, enabled: bool = True):
        self.ip = ip
        self.port = int(port)
        self.enabled = bool(enabled)
        self.client = SimpleUDPClient(self.ip, self.port)
        self._had_send_error = False

    def set_target(self, ip: str, port: int):
        self.ip = ip
        self.port = int(port)
        self.client = SimpleUDPClient(self.ip, self.port)
        logger.info("OSC target set to %s:%s", self.ip, self.port)

    def set_enabled(self, enabled: bool):
        self.enabled = bool(enabled)
        logger.info("OSC target %s:%s enabled=%s", self.ip, self.port, self.enabled)

    def send(self, address: str, *args):
        if not self.enabled:
            return
        # python-osc accepts list/tuple, we pass a list for consistency
        try:
            self.client.send_message(address, list(args))
            if self._had_send_error:
                logger.info("OSC send recovered for %s:%s", self.ip, self.port)
                self._had_send_error = False
        except Exception:
            # Ignore OSC/network errors so control loop keeps running.
            if not self._had_send_error:
                logger.exception("OSC send failed to %s:%s address=%s", self.ip, self.port, address)
            self._had_send_error = True
            return


class Outputs:
    """
    Minimal OSC adapters:
      - MA3: /cmd <string>
      - Resolume:
          /composition/tempocontroller/tempo <float 0.0..1.0>
          /composition/tempocontroller/resync <int 1>
          /composition/tempocontroller/metronome <int 0|1>
      - HeavyM: BPM and resync via configurable addresses.
    """

    def __init__(
        self,
        ma3: OscOut,
        resolume: OscOut,
        heavym: OscOut,
        ma3_bpm_master: str = "3.16",
        heavym_bpm_address: str = "/tempo/bpm",
        heavym_resync_address: str = "/tempo/resync",
        heavym_bpm_min: float = 20.0,
        heavym_bpm_max: float = 999.0,
        heavym_resync_value: float = 1.0,
        heavym_resync_send_zero: bool = False,
    ):
        self.ma3 = ma3
        self.resolume = resolume
        self.heavym = heavym
        self.ma3_bpm_master = str(ma3_bpm_master).strip() or "3.16"
        self.heavym_bpm_address = heavym_bpm_address
        self.heavym_resync_address = heavym_resync_address
        self.heavym_bpm_min = float(heavym_bpm_min)
        self.heavym_bpm_max = float(heavym_bpm_max)
        if self.heavym_bpm_max <= self.heavym_bpm_min:
            raise ValueError("HeavyM BPM max must be greater than min")
        self.heavym_resync_value = float(heavym_resync_value)
        self.heavym_resync_send_zero = bool(heavym_resync_send_zero)

    def _target(self, name: str) -> OscOut:
        if name == "ma3":
            return self.ma3
        if name == "resolume":
            return self.resolume
        if name == "heavym":
            return self.heavym
        raise ValueError(f"Unknown OSC target: {name}")

    def set_output_enabled(self, name: str, enabled: bool):
        self._target(name).set_enabled(enabled)

    def set_output_target(self, name: str, ip: str, port: int):
        self._target(name).set_target(ip, int(port))

    def settings_snapshot(self) -> dict[str, dict[str, object]]:
        return {
            "ma3": {"enabled": self.ma3.enabled, "ip": self.ma3.ip, "port": self.ma3.port},
            "resolume": {
                "enabled": self.resolume.enabled,
                "ip": self.resolume.ip,
                "port": self.resolume.port,
            },
            "heavym": {"enabled": self.heavym.enabled, "ip": self.heavym.ip, "port": self.heavym.port},
        }

    def heavym_settings_snapshot(self) -> dict[str, object]:
        return {
            "bpm_address": self.heavym_bpm_address,
            "resync_address": self.heavym_resync_address,
            "bpm_min": self.heavym_bpm_min,
            "bpm_max": self.heavym_bpm_max,
            "resync_value": self.heavym_resync_value,
            "resync_send_zero": self.heavym_resync_send_zero,
        }

    def set_heavym_osc(
        self,
        bpm_address: str | None = None,
        resync_address: str | None = None,
        bpm_min: float | None = None,
        bpm_max: float | None = None,
        resync_value: float | None = None,
        resync_send_zero: bool | None = None,
    ):
        if bpm_address is not None:
            self.heavym_bpm_address = bpm_address
        if resync_address is not None:
            self.heavym_resync_address = resync_address
        if bpm_min is not None:
            self.heavym_bpm_min = float(bpm_min)
        if bpm_max is not None:
            self.heavym_bpm_max = float(bpm_max)
        if self.heavym_bpm_max <= self.heavym_bpm_min:
            raise ValueError("HeavyM BPM max must be greater than min")
        if resync_value is not None:
            self.heavym_resync_value = float(resync_value)
        if resync_send_zero is not None:
            self.heavym_resync_send_zero = bool(resync_send_zero)

    def set_bpm(self, bpm: float):
        bpm_value = _compact_bpm_number(bpm)
        self._send_ma3_bpm(bpm_value)
        self._send_resolume_bpm(bpm)
        self._send_heavym_bpm(bpm)

    def set_bpm_for_target(self, name: str, bpm: float):
        bpm_value = _compact_bpm_number(bpm)
        if name == "ma3":
            self._send_ma3_bpm(bpm_value)
            return
        if name == "resolume":
            self._send_resolume_bpm(bpm)
            return
        if name == "heavym":
            self._send_heavym_bpm(bpm)
            return
        raise ValueError(f"Unknown OSC target: {name}")

    def trigger_resync_for_target(self, name: str):
        if name == "resolume":
            self.resolume.send("/composition/tempocontroller/resync", 1)
            return
        if name == "heavym":
            self._send_heavym_resync()
            return
        raise ValueError(f"Unknown OSC target: {name}")

    def _send_ma3_bpm(self, bpm_value: int | float):
        # grandMA3 onPC tempo control via command string on /cmd.
        command = f"Master {self.ma3_bpm_master} At BPM {_compact_bpm_text(float(bpm_value))}"
        self.ma3.send("/cmd", command)

    def _send_resolume_bpm(self, bpm: float):
        # Resolume: composition tempo expects normalized 0.0..1.0.
        self.resolume.send("/composition/tempocontroller/tempo", _bpm_to_resolume_tempo_norm(bpm))

    def _send_heavym_bpm(self, bpm: float):
        # HeavyM Pro+: tempo is normalized float 0.0..1.0 based on configured min/max.
        heavym_norm = _bpm_to_normalized_range(bpm, self.heavym_bpm_min, self.heavym_bpm_max)
        self.heavym.send(self.heavym_bpm_address, float(heavym_norm))

    def resync(self):
        self.resolume.send("/composition/tempocontroller/resync", 1)
        self._send_heavym_resync()

    def _send_heavym_resync(self):
        self.heavym.send(self.heavym_resync_address, float(self.heavym_resync_value))
        if self.heavym_resync_send_zero:
            self.heavym.send(self.heavym_resync_address, 0.0)

    def set_metronome(self, enabled: bool):
        self.resolume.send("/composition/tempocontroller/metronome", 1 if enabled else 0)

    def beat(self, beat: int, bar: int):
        # Keep internal beat progression for UI only; do not emit beat/bar OSC.
        # OSC output is restricted to BPM-change and explicit sync/resync controls.
        return

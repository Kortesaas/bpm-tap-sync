from __future__ import annotations

from pythonosc.udp_client import SimpleUDPClient


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


class OscOut:
    def __init__(self, ip: str, port: int, enabled: bool = True):
        self.ip = ip
        self.port = int(port)
        self.enabled = bool(enabled)
        self.client = SimpleUDPClient(self.ip, self.port)

    def set_target(self, ip: str, port: int):
        self.ip = ip
        self.port = int(port)
        self.client = SimpleUDPClient(self.ip, self.port)

    def set_enabled(self, enabled: bool):
        self.enabled = bool(enabled)

    def send(self, address: str, *args):
        if not self.enabled:
            return
        # python-osc accepts list/tuple, we pass a list for consistency
        try:
            self.client.send_message(address, list(args))
        except OSError:
            # Ignore transient UDP errors so control loop keeps running.
            return


class Outputs:
    """
    Minimal OSC adapters:
      - MA3: /cmd <string>
      - Resolume:
          /composition/tempocontroller/tempo <float 0.0..1.0>
          /composition/tempocontroller/resync <int 1>
          /composition/tempocontroller/metronome <int 0|1>
      - HeavyM: custom addresses (map in HeavyM OSC assignments)
    """

    def __init__(self, ma3: OscOut, resolume: OscOut, heavym: OscOut):
        self.ma3 = ma3
        self.resolume = resolume
        self.heavym = heavym

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

    def set_bpm(self, bpm: float):
        bpm_value = _compact_bpm_number(bpm)

        # MA3: command line via OSC.
        # You will likely change this string to match your showfile.
        self.ma3.send("/cmd", f"Master 3.1 At BPM {_compact_bpm_text(float(bpm_value))}")

        # Resolume: composition tempo expects normalized 0.0..1.0.
        self.resolume.send("/composition/tempocontroller/tempo", _bpm_to_resolume_tempo_norm(bpm))

        # HeavyM: your own mapping
        self.heavym.send("/bpm-tap-sync/bpm", bpm_value)

    def resync(self):
        self.resolume.send("/composition/tempocontroller/resync", 1)

    def set_metronome(self, enabled: bool):
        self.resolume.send("/composition/tempocontroller/metronome", 1 if enabled else 0)

    def beat(self, beat: int, bar: int):
        # HeavyM: drive beat/bar events (map in HeavyM)
        self.heavym.send("/bpm-tap-sync/beat", int(beat))
        self.heavym.send("/bpm-tap-sync/bar", int(bar))

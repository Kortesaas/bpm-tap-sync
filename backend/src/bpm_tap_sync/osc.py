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


class OscOut:
    def __init__(self, ip: str, port: int):
        self.client = SimpleUDPClient(ip, port)

    def send(self, address: str, *args):
        # python-osc accepts list/tuple, we pass a list for consistency
        self.client.send_message(address, list(args))


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

    def set_bpm(self, bpm: float):
        # MA3: command line via OSC.
        # You will likely change this string to match your showfile.
        self.ma3.send("/cmd", f"Master 3.1 At BPM {bpm:.1f}")

        # Resolume: composition tempo expects normalized 0.0..1.0.
        self.resolume.send("/composition/tempocontroller/tempo", _bpm_to_resolume_tempo_norm(bpm))

        # HeavyM: your own mapping
        self.heavym.send("/bpm-tap-sync/bpm", float(bpm))

    def resync(self):
        self.resolume.send("/composition/tempocontroller/resync", 1)

    def set_metronome(self, enabled: bool):
        self.resolume.send("/composition/tempocontroller/metronome", 1 if enabled else 0)

    def beat(self, beat: int, bar: int):
        # HeavyM: drive beat/bar events (map in HeavyM)
        self.heavym.send("/bpm-tap-sync/beat", int(beat))
        self.heavym.send("/bpm-tap-sync/bar", int(bar))

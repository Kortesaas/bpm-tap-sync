from __future__ import annotations

from pythonosc.udp_client import SimpleUDPClient


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
      - Resolume: /composition/tempocontroller/tempo <float>
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

        # Resolume: composition tempo
        self.resolume.send("/composition/tempocontroller/tempo", float(bpm))

        # HeavyM: your own mapping
        self.heavym.send("/bpm-tap-sync/bpm", float(bpm))

    def beat(self, beat: int, bar: int):
        # HeavyM: drive beat/bar events (map in HeavyM)
        self.heavym.send("/bpm-tap-sync/beat", int(beat))
        self.heavym.send("/bpm-tap-sync/bar", int(bar))

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass, field
from statistics import median
from typing import Callable, Optional


@dataclass
class TempoState:
    bpm: float = 120.0
    beat: int = 1
    bar: int = 1
    running: bool = True
    last_beat_ts: float = 0.0


@dataclass
class TapTracker:
    taps: list[float] = field(default_factory=list)
    max_taps: int = 6

    def add_tap(self, ts: float) -> Optional[float]:
        self.taps.append(ts)
        self.taps = self.taps[-self.max_taps:]

        # Need at least 3 taps for a stable estimate
        if len(self.taps) < 3:
            return None

        intervals = [self.taps[i] - self.taps[i - 1] for i in range(1, len(self.taps))]
        m = median(intervals)

        # Basic outlier reject: keep intervals within +/-20% of median
        good = [x for x in intervals if (0.8 * m) <= x <= (1.2 * m)]
        if len(good) < 2:
            return None

        return 60.0 / median(good)


def round_bpm(bpm: float, step: float = 0.1) -> float:
    return round(bpm / step) * step


class TempoEngine:
    def __init__(
        self,
        on_state: Callable[[TempoState], None],
        on_bpm: Callable[[float], None],
        on_beat: Callable[[int, int], None],
    ):
        self.state = TempoState()
        self.tap = TapTracker()
        self._on_state = on_state
        self._on_bpm = on_bpm
        self._on_beat = on_beat

        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()

    async def start(self):
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def set_bpm(self, bpm: float):
        async with self._lock:
            bpm = max(20.0, min(300.0, bpm))
            self.state.bpm = bpm
        self._on_bpm(bpm)

    async def tap_bpm(self):
        ts = time.monotonic()
        bpm = self.tap.add_tap(ts)
        if bpm:
            await self.set_bpm(round_bpm(bpm, 0.1))

    async def nudge(self, delta: float):
        async with self._lock:
            self.state.bpm = max(20.0, min(300.0, self.state.bpm + delta))
            bpm = self.state.bpm
        self._on_bpm(bpm)

    async def _run(self):
        self.state.last_beat_ts = time.monotonic()

        while True:
            async with self._lock:
                bpm = self.state.bpm
                running = self.state.running

            if not running:
                await asyncio.sleep(0.05)
                continue

            interval = 60.0 / bpm
            now = time.monotonic()
            next_ts = self.state.last_beat_ts + interval
            sleep_for = max(0.0, next_ts - now)
            await asyncio.sleep(sleep_for)

            # Beat tick
            self.state.last_beat_ts = next_ts
            self.state.beat += 1
            if self.state.beat > 4:
                self.state.beat = 1
                self.state.bar += 1

            self._on_beat(self.state.beat, self.state.bar)
            self._on_state(self.state)

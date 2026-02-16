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
    max_taps: int = 8
    reset_gap_s: float = 2.5
    min_interval_s: float = 0.2
    max_interval_s: float = 3.0
    tolerance: float = 0.25

    def add_tap(self, ts: float) -> Optional[float]:
        if self.taps and ts <= self.taps[-1]:
            return None

        # Restart estimation after a long pause between taps.
        if self.taps and (ts - self.taps[-1]) > self.reset_gap_s:
            self.taps = [ts]
            return None

        self.taps.append(ts)
        self.taps = self.taps[-self.max_taps:]

        # Need at least 3 taps for a stable estimate
        if len(self.taps) < 3:
            return None

        intervals = [self.taps[i] - self.taps[i - 1] for i in range(1, len(self.taps))]
        intervals = [x for x in intervals if self.min_interval_s <= x <= self.max_interval_s]
        if len(intervals) < 2:
            return None

        m = median(intervals)
        if m <= 0.0:
            return None

        # Outlier reject: keep intervals within +/-tolerance of median
        good = [x for x in intervals if abs(x - m) <= (self.tolerance * m)]
        if len(good) < 2:
            return None

        bpm = 60.0 / median(good)
        if not (20.0 <= bpm <= 300.0):
            return None
        return bpm


def round_bpm(bpm: float, step: float = 0.1) -> float:
    return round(bpm / step) * step


class TempoEngine:
    MIN_BPM = 20.0
    MAX_BPM = 300.0

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

    @staticmethod
    def _clamp(value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(maximum, value))

    def _snapshot_locked(self) -> TempoState:
        return TempoState(
            bpm=self.state.bpm,
            beat=self.state.beat,
            bar=self.state.bar,
            running=self.state.running,
            last_beat_ts=self.state.last_beat_ts,
        )

    async def start(self):
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def set_bpm(self, bpm: float):
        async with self._lock:
            bpm = self._clamp(float(bpm), self.MIN_BPM, self.MAX_BPM)
            self.state.bpm = bpm
            snapshot = self._snapshot_locked()
        self._on_bpm(bpm)
        self._on_state(snapshot)

    async def tap_bpm(self) -> bool:
        ts = time.monotonic()
        bpm = self.tap.add_tap(ts)
        if bpm is not None:
            await self.set_bpm(round_bpm(bpm, 0.1))
            return True

        # Broadcast unchanged state so clients stay in sync with tap activity.
        async with self._lock:
            snapshot = self._snapshot_locked()
        self._on_state(snapshot)
        return False

    async def nudge(self, delta: float):
        async with self._lock:
            self.state.bpm = self._clamp(self.state.bpm + float(delta), self.MIN_BPM, self.MAX_BPM)
            bpm = self.state.bpm
            snapshot = self._snapshot_locked()
        self._on_bpm(bpm)
        self._on_state(snapshot)

    async def get_state(self) -> TempoState:
        async with self._lock:
            return self._snapshot_locked()

    async def _run(self):
        async with self._lock:
            self.state.last_beat_ts = time.monotonic()
            snapshot = self._snapshot_locked()
        self._on_bpm(snapshot.bpm)
        self._on_state(snapshot)

        while True:
            async with self._lock:
                bpm = self.state.bpm
                running = self.state.running
                last_beat_ts = self.state.last_beat_ts

            if not running:
                await asyncio.sleep(0.05)
                continue

            interval = 60.0 / bpm
            now = time.monotonic()
            next_ts = last_beat_ts + interval
            sleep_for = max(0.0, next_ts - now)
            await asyncio.sleep(sleep_for)

            beat_events: list[tuple[int, int]] = []
            async with self._lock:
                if not self.state.running:
                    continue

                bpm = self.state.bpm
                interval = 60.0 / bpm
                now = time.monotonic()
                next_ts = self.state.last_beat_ts + interval

                # Advance one or more beats if we drifted behind.
                while now >= next_ts:
                    self.state.last_beat_ts = next_ts
                    self.state.beat += 1
                    if self.state.beat > 4:
                        self.state.beat = 1
                        self.state.bar += 1
                    beat_events.append((self.state.beat, self.state.bar))
                    next_ts = self.state.last_beat_ts + interval

                snapshot = self._snapshot_locked()

            for beat, bar in beat_events:
                self._on_beat(beat, bar)
            if beat_events:
                self._on_state(snapshot)

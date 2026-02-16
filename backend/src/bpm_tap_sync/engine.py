from __future__ import annotations

import asyncio
import math
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
    max_taps: int = 12
    reset_gap_s: float = 2.5
    min_interval_s: float = 0.2
    max_interval_s: float = 3.0
    tolerance: float = 0.22
    recent_window: int = 6
    last_estimated_bpm: Optional[float] = None

    def add_tap(self, ts: float) -> Optional[float]:
        if self.taps and ts <= self.taps[-1]:
            return None

        # Restart estimation after a long pause between taps.
        if self.taps and (ts - self.taps[-1]) > self.reset_gap_s:
            self.taps = [ts]
            self.last_estimated_bpm = None
            return None

        self.taps.append(ts)
        self.taps = self.taps[-self.max_taps:]

        # Need at least 3 taps (2 intervals) for a stable estimate.
        if len(self.taps) < 3:
            return None

        intervals = [self.taps[i] - self.taps[i - 1] for i in range(1, len(self.taps))]
        intervals = [x for x in intervals if self.min_interval_s <= x <= self.max_interval_s]
        if len(intervals) < 2:
            return None

        center = median(intervals)
        if center <= 0.0:
            return None

        # Robust outlier rejection: median + MAD band first.
        deviations = [abs(x - center) for x in intervals]
        mad = median(deviations)

        if mad > 1e-9:
            mad_band = 2.8 * mad
            good = [x for x in intervals if abs(x - center) <= mad_band]
        else:
            good = intervals[:]

        # Fallback band around median for near-constant taps.
        if len(good) < 2:
            ratio_band = self.tolerance * center
            good = [x for x in intervals if abs(x - center) <= ratio_band]
        if len(good) < 2:
            return None

        # Use a recency-weighted average to reduce jitter while adapting quickly.
        recent = good[-self.recent_window :]
        weights = list(range(1, len(recent) + 1))
        weighted_interval = sum(v * w for v, w in zip(recent, weights)) / sum(weights)
        if weighted_interval <= 0.0:
            return None

        bpm = 60.0 / weighted_interval
        if not (20.0 <= bpm <= 300.0):
            return None

        # Light temporal smoothing to stabilize display without lagging tempo changes too much.
        if self.last_estimated_bpm is not None:
            drift = abs(bpm - self.last_estimated_bpm) / max(self.last_estimated_bpm, 1e-6)
            alpha = 0.45 if drift < 0.08 else (0.6 if drift < 0.2 else 0.8)
            bpm = (1.0 - alpha) * self.last_estimated_bpm + alpha * bpm

        self.last_estimated_bpm = bpm
        return bpm


def round_bpm(bpm: float, step: float = 0.1) -> float:
    # Use half-up behavior for predictable BPM rounding.
    if step <= 0:
        return float(bpm)
    scaled = float(bpm) / float(step)
    rounded = math.floor(scaled + 0.5)
    return round(rounded * float(step), 6)


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
        self._bpm_step = 1.0

    @staticmethod
    def _clamp(value: float, minimum: float, maximum: float) -> float:
        return max(minimum, min(maximum, value))

    def _quantize(self, bpm: float) -> float:
        return round_bpm(bpm, self._bpm_step)

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
            previous_bpm = self.state.bpm
            bpm = self._clamp(float(bpm), self.MIN_BPM, self.MAX_BPM)
            bpm = self._quantize(bpm)
            self.state.bpm = bpm
            snapshot = self._snapshot_locked()
        if abs(bpm - previous_bpm) > 1e-9:
            self._on_bpm(bpm)
        self._on_state(snapshot)

    async def tap_bpm(self) -> bool:
        ts = time.monotonic()
        bpm = self.tap.add_tap(ts)
        if bpm is not None:
            await self.set_bpm(bpm)
            return True

        # Broadcast unchanged state so clients stay in sync with tap activity.
        async with self._lock:
            snapshot = self._snapshot_locked()
        self._on_state(snapshot)
        return False

    async def nudge(self, delta: float):
        async with self._lock:
            previous_bpm = self.state.bpm
            next_bpm = self._clamp(self.state.bpm + float(delta), self.MIN_BPM, self.MAX_BPM)
            self.state.bpm = self._quantize(next_bpm)
            bpm = self.state.bpm
            snapshot = self._snapshot_locked()
        if abs(bpm - previous_bpm) > 1e-9:
            self._on_bpm(bpm)
        self._on_state(snapshot)

    async def resync(self):
        async with self._lock:
            # Restart beat phase from beat 1 while keeping current bar count.
            self.state.beat = 1
            self.state.last_beat_ts = time.monotonic()
            snapshot = self._snapshot_locked()
        self._on_beat(snapshot.beat, snapshot.bar)
        self._on_state(snapshot)

    async def set_whole_bpm_rounding(self, enabled: bool):
        async with self._lock:
            previous_bpm = self.state.bpm
            self._bpm_step = 1.0 if enabled else 0.1
            self.state.bpm = self._quantize(self._clamp(self.state.bpm, self.MIN_BPM, self.MAX_BPM))
            bpm = self.state.bpm
            snapshot = self._snapshot_locked()
        if abs(bpm - previous_bpm) > 1e-9:
            self._on_bpm(bpm)
        self._on_state(snapshot)

    async def get_state(self) -> TempoState:
        async with self._lock:
            return self._snapshot_locked()

    async def _run(self):
        async with self._lock:
            self.state.last_beat_ts = time.monotonic()
            snapshot = self._snapshot_locked()
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

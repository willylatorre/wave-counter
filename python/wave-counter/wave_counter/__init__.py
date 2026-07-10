from __future__ import annotations

import json
from pathlib import Path
from typing import Any, TypedDict, cast

from ._native import NativeWaveCounter


class CounterSnapshot(TypedDict):
    key: str
    total: int
    updatedAt: str | None


class RecordEventResult(TypedDict):
    counter: CounterSnapshot
    created: bool


class AnalyticsPoint(TypedDict):
    start: str
    count: int


class Analytics(TypedDict):
    key: str
    window: str
    interval: str
    timezone: str
    total: int
    previousTotal: int
    changePercentage: float | None
    points: list[AnalyticsPoint]


class WaveCounterError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


class WaveCounter:
    def __init__(
        self,
        database_path: str | Path | None = None,
        initial_counts: dict[str, int] | None = None,
        busy_timeout_ms: int = 5_000,
    ) -> None:
        try:
            self._native = NativeWaveCounter(
                None if database_path is None else Path(database_path),
                initial_counts,
                busy_timeout_ms,
            )
        except RuntimeError as error:
            raise _domain_error(error) from None

    def get_counter(self, key: str) -> CounterSnapshot:
        return cast(CounterSnapshot, self._call(self._native.get_counter, key))

    def record_event(self, key: str, event_id: str) -> RecordEventResult:
        return cast(RecordEventResult, self._call(self._native.record_event, key, event_id))

    def analytics(self, key: str, window: str = "7d") -> Analytics:
        return cast(Analytics, self._call(self._native.analytics, key, window))

    @staticmethod
    def _call(operation: Any, *arguments: object) -> object:
        try:
            return json.loads(operation(*arguments))
        except RuntimeError as error:
            raise _domain_error(error) from None


def _domain_error(error: RuntimeError) -> WaveCounterError:
    encoded = str(error)
    code, separator, message = encoded.partition("|")
    if not separator:
        return WaveCounterError("storage", "storage operation failed")
    return WaveCounterError(code, message)


__all__ = [
    "Analytics",
    "AnalyticsPoint",
    "CounterSnapshot",
    "RecordEventResult",
    "WaveCounter",
    "WaveCounterError",
]


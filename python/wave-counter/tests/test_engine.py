from __future__ import annotations

from pathlib import Path

import pytest

from wave_counter import WaveCounter, WaveCounterError

EVENT_ID = "0198f2f7-6d42-7d94-b1a6-e4305543f132"


def test_python_binding_reads_records_and_replays(tmp_path: Path) -> None:
    counter = WaveCounter(database_path=tmp_path / "waves.sqlite3", initial_counts={"coffee": 67})

    assert counter.get_counter("coffee")["total"] == 67
    first = counter.record_event("coffee", EVENT_ID)
    replay = counter.record_event("coffee", EVENT_ID)

    assert first["created"] is True
    assert replay["created"] is False
    assert replay["counter"]["total"] == 68


@pytest.mark.parametrize(
    ("operation", "code"),
    [
        (lambda counter: counter.get_counter("Coffee"), "invalid_counter_key"),
        (
            lambda counter: counter.record_event(
                "coffee", "550e8400-e29b-41d4-a716-446655440000"
            ),
            "invalid_event_id",
        ),
        (lambda counter: counter.analytics("coffee", "30d"), "invalid_analytics_window"),
    ],
)
def test_python_binding_preserves_domain_error_codes(
    tmp_path: Path, operation: object, code: str
) -> None:
    counter = WaveCounter(database_path=tmp_path / "waves.sqlite3")

    with pytest.raises(WaveCounterError) as captured:
        operation(counter)  # type: ignore[operator]

    assert captured.value.code == code


def test_analytics_uses_the_public_contract_shape(tmp_path: Path) -> None:
    counter = WaveCounter(database_path=tmp_path / "waves.sqlite3")
    counter.record_event("coffee", EVENT_ID)

    analytics = counter.analytics("coffee")

    assert analytics["key"] == "coffee"
    assert analytics["window"] == "7d"
    assert analytics["interval"] == "day"
    assert analytics["timezone"] == "UTC"
    assert len(analytics["points"]) == 7


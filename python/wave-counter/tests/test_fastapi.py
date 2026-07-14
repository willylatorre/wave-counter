from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from wave_counter import WaveCounter, WaveCounterError
from wave_counter.fastapi import create_router

EVENT_ID = "0198f2f7-6d42-7d94-b1a6-e4305543f132"


def client_for(counter: object, **router_options: Any) -> TestClient:
    app = FastAPI()
    app.include_router(create_router(counter, **router_options), prefix="/api/waves")
    return TestClient(app, raise_server_exceptions=False)


def test_counter_event_and_analytics_routes_share_the_contract(tmp_path: Path) -> None:
    client = client_for(WaveCounter(database_path=tmp_path / "waves.sqlite3"))

    assert client.get("/api/waves/counters/coffee").json() == {
        "key": "coffee",
        "total": 0,
        "updatedAt": None,
    }

    first = client.post(
        "/api/waves/counters/coffee/events", json={"eventId": EVENT_ID}
    )
    replay = client.post(
        "/api/waves/counters/coffee/events", json={"eventId": EVENT_ID}
    )
    analytics = client.get("/api/waves/counters/coffee/analytics?window=7d")

    assert first.status_code == 201
    assert replay.status_code == 200
    assert first.json()["total"] == replay.json()["total"] == 1
    assert analytics.status_code == 200
    assert analytics.json()["total"] == 1
    assert len(analytics.json()["points"]) == 7


def test_domain_validation_errors_are_400(tmp_path: Path) -> None:
    client = client_for(WaveCounter(database_path=tmp_path / "waves.sqlite3"))

    invalid_key = client.get("/api/waves/counters/Coffee")
    invalid_id = client.post(
        "/api/waves/counters/coffee/events",
        json={"eventId": "550e8400-e29b-41d4-a716-446655440000"},
    )
    invalid_window = client.get("/api/waves/counters/coffee/analytics?window=30d")

    malformed_payloads = [
        client.post("/api/waves/counters/coffee/events", json={}),
        client.post("/api/waves/counters/coffee/events", json={"eventId": 7}),
        client.post(
            "/api/waves/counters/coffee/events",
            content="{",
            headers={"content-type": "application/json"},
        ),
    ]

    assert invalid_key.status_code == 400
    assert invalid_id.status_code == 400
    assert invalid_window.status_code == 400
    assert all(response.status_code == 400 for response in malformed_payloads)
    assert all(
        response.json()["error"]["code"] == "invalid_event_id"
        for response in malformed_payloads
    )
    assert invalid_window.json() == {
        "error": {
            "code": "invalid_analytics_window",
            "message": "analytics window is not supported",
        }
    }


def test_repeated_window_param_falls_back_to_default(tmp_path: Path) -> None:
    client = client_for(WaveCounter(database_path=tmp_path / "waves.sqlite3"))

    # A repeated window param is ambiguous, so it defaults to 7d rather than
    # rejecting, matching the Express adapter's array-to-default behavior.
    response = client.get("/api/waves/counters/coffee/analytics?window=7d&window=30d")

    assert response.status_code == 200
    assert response.json()["window"] == "7d"


def test_authorization_callback_composes_with_the_router(tmp_path: Path) -> None:
    counter = WaveCounter(database_path=tmp_path / "waves.sqlite3")
    client = client_for(counter, authorize=lambda request: request.headers.get("x-key") == "yes")

    assert client.get("/api/waves/counters/coffee").status_code == 403
    assert (
        client.get("/api/waves/counters/coffee", headers={"x-key": "yes"}).status_code == 200
    )


class FailingCounter:
    def __init__(self, error: WaveCounterError) -> None:
        self.error = error

    def get_counter(self, key: str) -> dict[str, object]:
        raise self.error


def test_busy_errors_are_retryable_and_internal_errors_are_sanitized() -> None:
    busy = client_for(FailingCounter(WaveCounterError("busy", "locked"))).get(
        "/api/waves/counters/coffee"
    )
    internal = client_for(FailingCounter(WaveCounterError("storage", "secret path"))).get(
        "/api/waves/counters/coffee"
    )

    assert busy.status_code == 503
    assert busy.headers["retry-after"] == "1"
    assert busy.json() == {
        "error": {"code": "busy", "message": "counter storage is temporarily busy"}
    }
    assert internal.status_code == 500
    assert internal.json() == {
        "error": {"code": "internal", "message": "internal counter error"}
    }
    assert "secret" not in internal.text


def test_shared_conformance_scenarios(tmp_path: Path) -> None:
    fixture_path = Path(__file__).parents[3] / "contracts" / "conformance.json"
    fixture = json.loads(fixture_path.read_text())

    for index, scenario in enumerate(fixture["scenarios"]):
        database = tmp_path / f"scenario-{index}.sqlite3"
        counter = WaveCounter(database_path=database, initial_counts=scenario["initialCounts"])
        client = client_for(counter)
        for step in scenario["steps"]:
            response = client.request(
                step["method"], f"/api/waves{step['path']}", json=step.get("json")
            )
            assert response.status_code == step["status"], scenario["name"]
            body = response.json()
            if "body" in step:
                assert body == step["body"], scenario["name"]
            else:
                assert body.items() >= step["bodyIncludes"].items(), scenario["name"]

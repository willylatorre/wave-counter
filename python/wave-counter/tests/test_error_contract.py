from __future__ import annotations

import json
from pathlib import Path

from wave_counter.fastapi import (
    DOMAIN_MESSAGE_CODES,
    ERROR_RESPONSES,
    FALLBACK,
    FORBIDDEN,
)

CONTRACT = json.loads(
    (Path(__file__).parents[3] / "contracts" / "error-responses.json").read_text()
)


# The FastAPI router's mapping table is a projection of the canonical contract.
# This test fails the moment the two diverge, forcing the single source
# (contracts/error-responses.json) to be updated alongside — which in turn
# obligates the Express router's identical guard to follow.
def test_router_table_mirrors_the_canonical_contract() -> None:
    assert set(DOMAIN_MESSAGE_CODES) == set(CONTRACT["domainMessageCodes"])
    assert FORBIDDEN["status"] == CONTRACT["forbidden"]["status"]
    assert FORBIDDEN["body"] == CONTRACT["forbidden"]["body"]
    assert FALLBACK["status"] == CONTRACT["fallback"]["status"]
    assert FALLBACK["body"] == CONTRACT["fallback"]["body"]

    assert set(ERROR_RESPONSES) == set(CONTRACT["responses"])
    for code, spec in CONTRACT["responses"].items():
        local = ERROR_RESPONSES[code]
        assert local["status"] == spec["status"], code
        assert local.get("headers") == spec.get("headers"), code
        assert local.get("body") == spec.get("body"), code

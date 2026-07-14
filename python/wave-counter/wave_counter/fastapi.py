from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Protocol, TypeAlias, cast

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from . import Analytics, CounterSnapshot, RecordEventResult, WaveCounterError


class Counter(Protocol):
    def get_counter(self, key: str) -> CounterSnapshot: ...

    def record_event(self, key: str, event_id: str) -> RecordEventResult: ...

    def analytics(self, key: str, window: str = "7d") -> Analytics: ...


Authorize: TypeAlias = Callable[[Request], bool | Awaitable[bool]]


def create_router(counter: Counter, authorize: Authorize | None = None) -> APIRouter:
    router = APIRouter()

    async def allowed(request: Request) -> bool:
        if authorize is None:
            return True
        result = authorize(request)
        if inspect.isawaitable(result):
            return await result
        return result

    async def guarded(request: Request, action: Callable[[], Awaitable[object]]) -> object:
        if not await allowed(request):
            return forbidden()
        try:
            return await action()
        except Exception as error:  # FastAPI boundary sanitizes unexpected failures.
            return error_response(error)

    @router.get("/counters/{key}", response_model=None)
    async def get_counter(request: Request, key: str) -> object:
        async def action() -> CounterSnapshot:
            return counter.get_counter(key)

        return await guarded(request, action)

    @router.post("/counters/{key}/events", response_model=None)
    async def record_event(request: Request, key: str) -> object:
        async def action() -> JSONResponse:
            result = counter.record_event(key, await read_event_id(request))
            return JSONResponse(
                status_code=201 if result["created"] else 200,
                content=cast(dict[str, object], result["counter"]),
            )

        return await guarded(request, action)

    @router.get("/counters/{key}/analytics", response_model=None)
    async def analytics(request: Request, key: str) -> object:
        async def action() -> Analytics:
            return counter.analytics(key, read_window(request))

        return await guarded(request, action)

    return router


async def read_event_id(request: Request) -> str:
    # Coerce a missing, non-string, or malformed body to an empty id so the
    # engine produces the single authoritative invalid_event_id error, matching
    # the Express adapter rather than hardcoding a domain message here.
    try:
        payload = await request.json()
    except Exception:
        payload = None
    raw = payload.get("eventId") if isinstance(payload, dict) else None
    return raw if isinstance(raw, str) else ""


def read_window(request: Request) -> str:
    # A single window value is forwarded to the engine; an absent or repeated
    # param falls back to the default, mirroring the Express adapter.
    values = request.query_params.getlist("window")
    return values[0] if len(values) == 1 else "7d"


# Declarative HTTP error contract for the FastAPI router. This table is the
# Python projection of contracts/error-responses.json — the single source of
# truth shared with the Express router. test_error_contract.py asserts the two
# stay identical, so a status/message change here fails until the canonical
# fixture (and therefore every other language) is updated to match.

# Codes whose response reuses the originating WaveCounterError message verbatim.
DOMAIN_MESSAGE_CODES: frozenset[str] = frozenset(
    {"invalid_counter_key", "invalid_event_id", "invalid_analytics_window"}
)

# Per-code responses. Domain-message codes carry status only; their body is built
# from the error. Others carry a static status/headers/body envelope.
ERROR_RESPONSES: dict[str, dict[str, object]] = {
    "invalid_counter_key": {"status": 400},
    "invalid_event_id": {"status": 400},
    "invalid_analytics_window": {"status": 400},
    "busy": {
        "status": 503,
        "headers": {"Retry-After": "1"},
        "body": {"code": "busy", "message": "counter storage is temporarily busy"},
    },
}

FORBIDDEN: dict[str, object] = {
    "status": 403,
    "body": {"code": "forbidden", "message": "counter access denied"},
}

FALLBACK: dict[str, object] = {
    "status": 500,
    "body": {"code": "internal", "message": "internal counter error"},
}


def _envelope(
    status: int, body: dict[str, str], headers: dict[str, str] | None = None
) -> JSONResponse:
    return JSONResponse(status_code=status, headers=headers, content={"error": body})


def forbidden() -> JSONResponse:
    return _envelope(cast(int, FORBIDDEN["status"]), cast(dict[str, str], FORBIDDEN["body"]))


def error_response(error: Exception) -> JSONResponse:
    if not isinstance(error, WaveCounterError):
        return internal_error()
    spec = ERROR_RESPONSES.get(error.code)
    if spec is None:
        return internal_error()
    body = (
        {"code": error.code, "message": error.message}
        if error.code in DOMAIN_MESSAGE_CODES
        else cast(dict[str, str], spec["body"])
    )
    return _envelope(
        cast(int, spec["status"]),
        body,
        cast("dict[str, str] | None", spec.get("headers")),
    )


def internal_error() -> JSONResponse:
    return _envelope(cast(int, FALLBACK["status"]), cast(dict[str, str], FALLBACK["body"]))

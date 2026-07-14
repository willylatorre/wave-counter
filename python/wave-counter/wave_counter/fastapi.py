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


def forbidden() -> JSONResponse:
    return JSONResponse(
        status_code=403,
        content={"error": {"code": "forbidden", "message": "counter access denied"}},
    )


def error_response(error: Exception) -> JSONResponse:
    if not isinstance(error, WaveCounterError):
        return internal_error()
    if error.code in {
        "invalid_counter_key",
        "invalid_event_id",
        "invalid_analytics_window",
    }:
        return JSONResponse(
            status_code=400,
            content={"error": {"code": error.code, "message": error.message}},
        )
    if error.code == "busy":
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": "1"},
            content={
                "error": {
                    "code": "busy",
                    "message": "counter storage is temporarily busy",
                }
            },
        )
    return internal_error()


def internal_error() -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal", "message": "internal counter error"}},
    )

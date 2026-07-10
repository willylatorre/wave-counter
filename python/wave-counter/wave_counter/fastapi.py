from __future__ import annotations

import inspect
from collections.abc import Awaitable, Callable
from typing import Protocol, TypeAlias, cast

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from . import Analytics, CounterSnapshot, RecordEventResult, WaveCounterError


class Counter(Protocol):
    def get_counter(self, key: str) -> CounterSnapshot: ...

    def record_event(self, key: str, event_id: str) -> RecordEventResult: ...

    def analytics(self, key: str, window: str = "7d") -> Analytics: ...


Authorize: TypeAlias = Callable[[Request], bool | Awaitable[bool]]


class EventBody(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    event_id: str = Field(alias="eventId")


def create_router(counter: Counter, authorize: Authorize | None = None) -> APIRouter:
    router = APIRouter()

    async def allowed(request: Request) -> bool:
        if authorize is None:
            return True
        result = authorize(request)
        if inspect.isawaitable(result):
            return await result
        return result

    @router.get("/counters/{key}", response_model=None)
    async def get_counter(request: Request, key: str) -> CounterSnapshot | JSONResponse:
        if not await allowed(request):
            return forbidden()
        try:
            return counter.get_counter(key)
        except Exception as error:  # FastAPI boundary sanitizes unexpected failures.
            return error_response(error)

    @router.post("/counters/{key}/events", response_model=None)
    async def record_event(
        request: Request, key: str, body: EventBody
    ) -> CounterSnapshot | JSONResponse:
        if not await allowed(request):
            return forbidden()
        try:
            result = counter.record_event(key, body.event_id)
            return JSONResponse(
                status_code=201 if result["created"] else 200,
                content=cast(dict[str, object], result["counter"]),
            )
        except Exception as error:  # FastAPI boundary sanitizes unexpected failures.
            return error_response(error)

    @router.get("/counters/{key}/analytics", response_model=None)
    async def analytics(
        request: Request, key: str, window: str = "7d"
    ) -> Analytics | JSONResponse:
        if not await allowed(request):
            return forbidden()
        try:
            return counter.analytics(key, window)
        except Exception as error:  # FastAPI boundary sanitizes unexpected failures.
            return error_response(error)

    return router


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

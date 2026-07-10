from __future__ import annotations

import os
import tempfile
from pathlib import Path

from fastapi import FastAPI

from wave_counter import WaveCounter
from wave_counter.fastapi import create_router

database_path = Path(tempfile.gettempdir()) / f"wave-counter-fastapi-{os.getpid()}.sqlite3"
counter = WaveCounter(database_path=database_path)

app = FastAPI(title="Wave Counter FastAPI playground")
app.include_router(create_router(counter), prefix="/api/waves")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


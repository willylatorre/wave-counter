from __future__ import annotations

from pathlib import Path

class NativeWaveCounter:
    def __init__(
        self,
        database_path: Path | None = None,
        initial_counts: dict[str, int] | None = None,
        busy_timeout_ms: int = 5_000,
    ) -> None: ...

    def get_counter(self, key: str) -> str: ...

    def record_event(self, key: str, event_id: str) -> str: ...

    def analytics(self, key: str, window: str = "7d") -> str: ...

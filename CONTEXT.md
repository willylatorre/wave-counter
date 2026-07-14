# Context

Domain language and load-bearing architectural invariants for Wave Counter. This
file is the glossary: it names the concepts and records the decisions a
contributor (human or agent) needs before changing anything. Product intent lives
in [PRODUCT.md](PRODUCT.md); visual design lives in [DESIGN.md](DESIGN.md).

## Domain vocabulary

- **Counter** — a named tally identified by a **counter key**. Total is
  `baseline_count + event_count`. An unknown counter reads as a **virtual zero
  counter** (total 0, no `updatedAt`) rather than an error.
- **Counter key** — matches `[a-z0-9][a-z0-9_-]{0,63}`: lowercase alphanumeric
  start, then alphanumerics, `_`, or `-`, up to 64 bytes. Anything else is
  `invalid_counter_key`.
- **Event** — one recorded occurrence, identified by an **event ID** that must be
  a **UUIDv7**. Recording is **idempotent by event ID**: replaying the same ID
  returns the existing counter without incrementing again.
- **Baseline count** — a configured starting total (`initial_counts`) inserted
  once per key and never overwritten. Baselines do **not** fabricate analytics
  history — analytics count real events only.
- **Snapshot** (`CounterSnapshot`) — `{ key, total, updatedAt }`, the
  authoritative view of a counter at a point in time.
- **Analytics** — the seven-day activity view (see window semantics below).
- **Optimistic total** — the browser client's displayed total: the last
  authoritative snapshot plus locally pending increments, reconciled toward the
  server's authoritative value.

## Analytics window semantics

- Fixed **seven-day** window (`7d` is the only supported value; anything else is
  `invalid_analytics_window`).
- Buckets are **daily**, computed in **UTC**, over a **half-open `[start, end)`**
  interval — the current window ends where the next UTC day begins, so an event at
  exactly `now` and the current/previous split share one convention.
- Seven daily buckets; `total` is their sum. `previousTotal` is the prior
  seven-day window. `changePercentage` is **null when `previousTotal` is 0** (no
  baseline to compare against), otherwise `(total - previous) / previous * 100`.
- Canonical implementation: `crates/wave-counter-core/src/store.rs` (`analytics`).

## Architectural invariants

These are the rules that keep the system coherent across five packages and three
languages. Breaking one silently is how this codebase gets a bug.

1. **Domain logic is single-sourced in the Rust core**
   (`crates/wave-counter-core`). Validation, idempotency, the seven-day window,
   virtual-zero, and the error wire format all live there. **Bindings must never
   re-validate keys/event IDs or recompute analytics** — they call the core and
   pass results through. The pyo3 (`python/wave-counter/src/lib.rs`) and napi
   (`packages/node/src/lib.rs`) layers are intentionally thin adapters.

2. **The error wire format is `code|message`**, defined once in
   `crates/wave-counter-core/src/error.rs` (`WaveCounterError::wire`). Both native
   bindings emit it; both binding wrappers
   (`python/wave-counter/wave_counter/__init__.py`, `packages/node/src/index.ts`)
   decode it by splitting on the first `|`. Error **codes** are the stable
   contract: `invalid_counter_key`, `invalid_event_id`,
   `invalid_analytics_window`, `busy`, `configuration`, `storage`.

3. **The HTTP error→status mapping is currently duplicated** across the FastAPI
   (`python/wave-counter/wave_counter/fastapi.py`) and Express
   (`packages/node/src/express.ts`) routers, and must stay in lockstep:
   - `invalid_*` codes → **400**
   - `busy` → **503** with `Retry-After: 1`
   - anything unexpected (including non-domain errors) → **500** with a sanitized
     `internal` envelope
   - unauthorized → **403** `forbidden`
   - envelope shape is always `{ "error": { "code", "message" } }`.
   `contracts/conformance.json` guards behavioral agreement but does not prevent
   the mapping *logic* from drifting; edit both routers together. (This
   duplication is a known deepening candidate — see the architecture review.)

4. **Storage is host-owned SQLite.** The engine creates only `waves_*` tables,
   requires WAL journal mode and foreign keys, opens with `FULL_MUTEX`, and pools
   connections so per-connection PRAGMA setup runs once. A busy/locked database
   collapses to the `busy` error → `503`. Default path is
   `./wave-counter.sqlite3`. Auth, CORS, rate limiting, backups, and durable
   volumes belong to the **host application**, not this library.

5. **Domain type shapes are hand-mirrored** from the Rust serde model
   (`crates/wave-counter-core/src/model.rs`, `camelCase` on the wire) into Python
   TypedDicts (`__init__.py`), the Node interfaces (`packages/node/src/index.ts`),
   and the browser client types (`packages/client/src/types.ts`). There is no
   codegen link — a field change means editing all four. (Known deepening
   candidate.)

6. **The browser client is the shared frontend brain.**
   `packages/client/src/controller.ts` owns optimistic increment + reconciliation
   (keeps the max of pending vs. authoritative totals so a slow load can't clobber
   a completed increment) and the stats sub-state machine. React and Vue hooks are
   thin reactivity adapters over one `WaveCounterController`. `increment()` retries
   once on a network `TypeError` reusing the **same** event ID, relying on core
   idempotency.

7. **Accessible analytics text must be identical across frameworks.** PRODUCT.md
   requires textual total, comparison, UTC range, and daily-count summary beside
   every chart, with wording that matches. Today the formatting helpers
   (`comparisonText`/`rangeText`/`summaryText`) and the chart coordinate math are
   copied between `packages/react` and `packages/vue`; keep them in sync. (Known
   deepening candidate: hoist into `@waves-counter/client`.)

## Known deepening candidates

Recorded so future architecture reviews don't re-derive them from scratch. None
have been implemented yet.

1. **Single-source the error→HTTP-status mapping** so both routers read one table
   (e.g. a status hint carried on the core error code) instead of duplicating
   invariant #3.
2. **Generate the mirrored DTO types** (Python/TS) from the Rust model to remove
   the four-way hand-mirror in invariant #5.
3. **Hoist the analytics text + chart math** into `@waves-counter/client` so
   React and Vue share one tested copy (invariant #7).

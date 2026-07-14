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

- Supported windows: **`7d`**, **`1M`** (30 days), and **`all`** (all-time).
  Anything else is `invalid_analytics_window`. `7d` is the default.
- Buckets are **daily**, computed in **UTC**, over a **half-open `[start, end)`**
  interval — the current window ends where the next UTC day begins, so an event at
  exactly `now` and the current/previous split share one convention.
- `total` is the sum of the window's buckets. Fixed windows (`7d`, `1M`) also
  report a `previousTotal` for the immediately-preceding period; `all` has no
  previous period. `changePercentage` is **null when `previousTotal` is 0** (no
  baseline to compare against), otherwise `(total - previous) / previous * 100`.
- Canonical implementation: `crates/wave-counter-core/src/store.rs` (`analytics`).
- The **accessible presentation** of a window (comparison sentence, UTC range,
  screen-reader summary, chart geometry) is single-sourced in
  `packages/client/src/analytics.ts` — see invariant #7.

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

3. **The HTTP error→status mapping is single-sourced** in
   `contracts/error-responses.json`. Each router mirrors that table declaratively
   — Express in `packages/node/src/errorContract.ts`, FastAPI in the
   `ERROR_RESPONSES`/`FORBIDDEN`/`FALLBACK` tables in
   `python/wave-counter/wave_counter/fastapi.py` — and each language asserts its
   table equals the fixture (`packages/node/test/errorContract.test.ts`,
   `python/wave-counter/tests/test_error_contract.py`). Change the fixture and
   both drift tests fail until every router follows. The contract:
   - `invalid_*` codes → **400**, reusing the engine's own message
   - `busy` → **503** with `Retry-After: 1`
   - anything unexpected (including non-domain errors) → **500** with a sanitized
     `internal` envelope
   - unauthorized → **403** `forbidden`
   - envelope shape is always `{ "error": { "code", "message" } }`.

4. **Storage is host-owned SQLite.** The engine creates only `waves_*` tables,
   requires WAL journal mode and foreign keys, opens with `FULL_MUTEX`, and pools
   connections so per-connection PRAGMA setup runs once. A busy/locked database
   collapses to the `busy` error → `503`. Default path is
   `./wave-counter.sqlite3`. Auth, CORS, rate limiting, backups, and durable
   volumes belong to the **host application**, not this library.

5. **Domain type shapes are hand-mirrored** from the Rust serde model
   (`crates/wave-counter-core/src/model.rs`, `camelCase` on the wire) into Python
   TypedDicts (`__init__.py`), the Node interfaces (`packages/node/src/index.ts`),
   and the browser client types (`packages/client/src/types.ts`). The four copies
   are still hand-written, but `contracts/dto-schema.json` is the canonical field
   list and `tooling/check-dtos.mjs` (run by `npm run check`) parses all four
   declarations and fails on any drift. Add/rename a field → update the schema and
   every language, or the check breaks.

6. **The browser client is the shared frontend brain.**
   `packages/client/src/controller.ts` owns optimistic increment + reconciliation
   (keeps the max of pending vs. authoritative totals so a slow load can't clobber
   a completed increment) and the stats sub-state machine. React and Vue hooks are
   thin reactivity adapters over one `WaveCounterController`. `increment()` retries
   once on a network `TypeError` reusing the **same** event ID, relying on core
   idempotency.

7. **Accessible analytics text is single-sourced.** PRODUCT.md requires textual
   total, comparison, UTC range, and daily-count summary beside every chart, with
   wording that matches across frameworks. The formatting helpers
   (`comparisonText`/`rangeText`/`summaryText`/`windowSummary`/`capitalize`) and
   the chart coordinate math (`analyticsChartPoints`) live once in
   `packages/client/src/analytics.ts` and are unit-tested there
   (`packages/client/test/analytics.test.ts`). React and Vue import them; the
   framework components hold only DOM, animation, and event wiring.

## Architecture review history

The three cross-language deepening opportunities surfaced by the architecture
review have all been implemented (see invariants #3, #5, #7). Each followed the
same repo pattern: a canonical fixture in `contracts/` plus a drift guard, or a
shared module in `@waves-counter/client`. If a future review re-surfaces them,
they are done — verify the guard still runs before re-opening.

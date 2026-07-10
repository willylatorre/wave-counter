# Wave Counter v1 Design

## Summary

Wave Counter is a public, self-hosted counter library with a playful default UI and useful event analytics. A visitor clicks a compact icon button to add one anonymous event. The button immediately displays the updated global total. Right-click, long press, or the keyboard context-menu shortcut opens an anchored analytics popover with an animated seven-day line chart.

The project ships native Python and Node backend integrations over one Rust and SQLite engine. The first frontend package targets Vue. React and Svelte adapters are future work, but v1 establishes a reusable browser client and component contract for them. The existing coffee counter on `adrianlatorre.com` will become the first production integration.

## Goals

- Support named global counters such as `coffee`, `likes`, and `waves`.
- Record one anonymous, timestamped event per click.
- Return an authoritative total and seven-day analytics.
- Provide idiomatic FastAPI and Express routers.
- Provide a polished, themeable Vue component and a headless composable.
- Use one Rust implementation for SQLite schema, migrations, transactions, analytics, validation, and domain errors.
- Publish installable Python and npm packages with native binaries.
- Preserve the current coffee total when migrating `adrianlatorre.com`.
- Reserve a clear location for a future documentation and marketing website without implementing it in v1.

## Non-goals

- User identity, authentication, or per-user counters.
- Arbitrary event metadata, referrer tracking, or campaign analytics.
- Built-in CORS, rate limiting, or abuse prevention.
- Counter reset, deletion, or public counter listing.
- Offline event queues.
- Time-range controls beyond the default seven-day view.
- React, Svelte, or a public Rust API in v1.
- A hosted Wave Counter service.
- The future website.

## Architecture

The Rust crate is the canonical domain and persistence engine. It owns SQLite connections, package migrations, counter validation, atomic event recording, totals, UTC analytics, and structured errors. It contains no HTTP framework code.

PyO3 and maturin expose the Rust engine to Python. The Python package adds an optional FastAPI router. Rust work releases the Python GIL.

napi-rs exposes the same engine to Node. The Node package adds an Express router. Database calls run as asynchronous native tasks so they do not block the Node event loop.

A framework-neutral TypeScript client implements the HTTP contract, event ID creation, optimistic reconciliation, and analytics loading. The Vue package builds its component and composable on this client. Future React and Svelte packages will reuse the same contract.

The repository layout is:

```text
wave-counter/
├── apps/
│   ├── playground/
│   └── website/
├── contracts/
├── crates/
│   └── wave-counter-core/
├── docs/
├── packages/
│   ├── client/
│   ├── node/
│   └── vue/
├── python/
│   └── wave-counter/
└── tooling/
```

The playground is executable documentation and can switch between FastAPI and Express example backends. The future website is not implemented in v1.

## Persistence

Wave Counter stores its data in namespaced tables to avoid collisions with host application schemas:

```text
waves_counters
- key TEXT PRIMARY KEY
- baseline_count INTEGER NOT NULL DEFAULT 0
- event_count INTEGER NOT NULL DEFAULT 0
- created_at INTEGER NOT NULL
- updated_at INTEGER NOT NULL

waves_events
- id TEXT PRIMARY KEY
- counter_key TEXT NOT NULL REFERENCES waves_counters(key)
- occurred_at INTEGER NOT NULL

waves_migrations
- version INTEGER PRIMARY KEY
- applied_at INTEGER NOT NULL
```

An index on `(counter_key, occurred_at)` supports analytics queries. Timestamps are stored as UTC Unix integers and serialized as ISO 8601 UTC strings at public boundaries.

Each event is inserted and its counter aggregate incremented in one transaction. The client creates the event ID before sending the request. Reusing an event ID returns the authoritative counter without incrementing twice, making retries safe after ambiguous network failures.

`baseline_count` preserves totals imported from an existing system without inventing historical events. The displayed total is `baseline_count + event_count`. Analytics only describe real `waves_events` recorded after migration.

The engine accepts an optional database path. When a host passes its existing durable `DB_PATH`, Rust opens its own connections to that SQLite file and limits migrations to `waves_*` tables. A live Python or Node connection object does not cross the native boundary. With no path, the engine creates `./wave-counter.sqlite3` for quick starts and examples.

Connections enable foreign keys, request WAL mode, and apply a configurable busy timeout. If the SQLite environment rejects WAL mode, initialization fails with a configuration error instead of silently changing concurrency behavior.

## HTTP Contract

Both framework adapters expose identical routes beneath a host-selected prefix:

```http
GET /counters/{key}
POST /counters/{key}/events
GET /counters/{key}/analytics?window=7d
```

Counter keys match `[a-z0-9][a-z0-9_-]{0,63}`. Reading an unknown counter returns a virtual zero counter whose `updatedAt` is null. The first accepted event persists it. Backend initialization may specify baseline counts for migrations. A configured baseline is applied only when its counter is first created and never overwrites an existing total.

Counter responses have this shape:

```json
{
  "key": "coffee",
  "total": 128,
  "updatedAt": "2026-07-10T13:42:00Z"
}
```

`updatedAt` is an ISO 8601 UTC string or null for a virtual zero counter.

The event endpoint accepts a JSON body containing a UUIDv7 generated by the client:

```json
{ "eventId": "0198f2f7-6d42-7d94-b1a6-e4305543f132" }
```

The first accepted event returns `201`; an idempotent replay returns `200`. Both responses contain the authoritative counter snapshot.

Analytics responses have this shape:

```json
{
  "key": "coffee",
  "window": "7d",
  "interval": "day",
  "timezone": "UTC",
  "total": 42,
  "previousTotal": 35,
  "changePercentage": 20,
  "points": [
    { "start": "2026-07-04T00:00:00Z", "count": 4 }
  ]
}
```

V1 accepts only `window=7d` and returns daily UTC buckets. The response shape allows future windows and intervals without redefining the component boundary.

## Backend APIs

Python initialization:

```python
from wave_counter import WaveCounter
from wave_counter.fastapi import create_router

counter = WaveCounter(
    database_path=settings.database_path,
    initial_counts={"coffee": 67},
)
app.include_router(create_router(counter), prefix="/api/waves")
```

Node initialization:

```ts
const counter = new WaveCounter({
  databasePath: process.env.DB_PATH,
  initialCounts: { coffee: 67 },
})
app.use('/api/waves', createWaveRouter(counter))
```

Authentication, CORS, and rate limiting remain host concerns. Both routers compose with normal framework middleware and allow an optional authorization callback.

## Vue Component

The Vue package exports a polished component and a headless composable:

```vue
<WaveCounter
  counter-key="coffee"
  endpoint="/api/waves"
  :icon="Coffee"
  :show-stats="true"
/>
```

The default icon is coffee. Consumers may pass any `lucide-vue-next` component or provide an icon slot. Additional slots customize button content and analytics content. CSS custom properties control color, surface, border, radius, and motion. The package does not depend on Nuxt UI.

`useWaveCounter` returns reactive counter state plus a controller:

```ts
counter.enableStats(true)
counter.openStats()
counter.closeStats()
counter.toggleStats()
```

`showStats` defaults to true and controls whether analytics interaction is available. `enableStats(false)` closes an open popover, prevents analytics loading, and restores normal browser context-menu behavior. This setting is runtime state; persistence belongs to the host.

On mount, the component loads the current total. Left-click generates an event ID, optimistically increments the visible total, and sends the event. Success reconciles with the authoritative total. Failure rolls back and emits an `error` event.

Right-click opens analytics directly, without an intermediate menu. Touch uses a deliberate long press. Keyboard access uses the context-menu key or Shift+F10. Escape, outside-click, and focus restoration close the anchored popover.

The default analytics view shows seven UTC days as an SVG line chart. It includes textual total, comparison, and date-range information. The chart is hidden from assistive technology because the same information is available as text and an accessible summary.

## Motion and Visual Treatment

The component uses calm tinted surfaces, quiet depth, and a restrained accent. It is lightly styled and themeable rather than headless or tightly coupled to a design system.

Button press feedback takes approximately 100 to 150 milliseconds. The analytics popover enters over 220 to 250 milliseconds using opacity and transform with an ease-out exponential curve. The line draws once when analytics opens and then remains still. Motion never blocks interaction or animates layout properties.

`prefers-reduced-motion` removes the press, entrance, and line-drawing effects while preserving all state changes.

## Errors

- Invalid counter keys, event IDs, and analytics windows return `400`.
- SQLite busy errors after the configured timeout return `503` with `Retry-After`.
- Unexpected storage or migration failures return `500` without leaking internal details.
- Duplicate event IDs return the authoritative total without incrementing.
- Initial frontend load failure shows a neutral unavailable state.
- Increment failure rolls back the optimistic total and emits `error`.
- Analytics failure stays inside the popover and offers retry.

Domain errors originate in Rust and map consistently through both bindings and HTTP adapters.

## Testing

Rust unit tests cover validation, migrations, idempotency, baseline totals, UTC buckets, comparison calculations, and domain errors. Rust integration tests use temporary SQLite files to verify transactions, concurrent increments, WAL behavior, and busy timeouts.

PyO3 and napi-rs parity tests execute shared fixtures through both bindings. FastAPI and Express contract tests assert identical routes, payloads, and status codes.

The TypeScript client tests event creation, retries, optimistic reconciliation, and failures. Vue tests cover clicks, context-menu access, long press, keyboard access, slots, `showStats`, controller methods, rollback, accessible summaries, and reduced motion.

Browser tests exercise the complete Vue-to-FastAPI and Vue-to-Express paths in the playground. Packaging smoke tests cover supported Python and Node releases on macOS, Linux, and Windows.

## Packaging and Releases

All public packages use coordinated semantic versions for v1. Intended npm names are `@wave-counter/node`, `@wave-counter/client`, and `@wave-counter/vue`. The release setup first attempts to establish the `@wave-counter` npm scope; if that scope cannot be controlled, the packages use `@willylatorre/node`, `@willylatorre/client`, and `@willylatorre/vue`. The PyPI distribution is `wave-counter`, imported as `wave_counter`.

GitHub Actions runs tests, builds Python wheels and Node prebuilds for supported platforms, and publishes from a version tag. Registry authentication uses trusted publishing and npm provenance where available. The Rust crate remains internal in v1.

## Dogfood Migration

`adrianlatorre.com` becomes the first production consumer:

1. Install the Python and Vue packages.
2. Pass the site's persistent `DB_PATH` to Wave Counter.
3. Configure `coffee` with the authoritative legacy total at migration time.
4. Mount the FastAPI router at `/api/waves`.
5. Replace the local Vue coffee behavior with `@wave-counter/vue` while preserving the site's surrounding presentation.
6. Verify total preservation, increment behavior, analytics, persistence, and deployment configuration.
7. Remove the legacy coffee table, repository, models, routes, API methods, and tests only after the Wave Counter integration is green.

The baseline contributes to the displayed total. Historical analytics begin at migration time and never fabricate events for the imported count.

## Success Criteria

- A new FastAPI or Express application can install Wave Counter, point it at SQLite, and mount working routes with minimal configuration.
- A Vue application can render a coffee counter, record events, display the authoritative total, and open accessible seven-day analytics.
- Python and Node return identical behavior for shared conformance fixtures.
- Duplicate requests never increment twice.
- Concurrent increments do not lose events.
- Native packages install on the supported release matrix without local Rust tooling.
- `adrianlatorre.com` preserves its deployed total and persistent database while replacing its legacy coffee implementation.

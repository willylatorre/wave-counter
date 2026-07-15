# @waves-counter/node

Native Node and Express integration for Wave Counter.

This package wraps the shared Rust engine with a Node API and an optional Express router. It stores anonymous counter events in SQLite, handles idempotent event IDs, and keeps database work off the JavaScript event loop.

## Install

```bash
npm install @waves-counter/node express
```

Node 20 or newer is required.

## Quick start with Express

```ts
import express from 'express'
import { WaveCounter } from '@waves-counter/node'
import { createWaveRouter } from '@waves-counter/node/express'

const app = express()
const counter = new WaveCounter({
  databasePath: process.env.WAVE_COUNTER_DB ?? './wave-counter.sqlite3',
  initialCounts: { coffee: 67 },
  busyTimeoutMs: 1000,
})

app.use(express.json())
app.use(
  '/api/waves',
  createWaveRouter(counter, {
    authorize: (request) => request.header('x-api-key') === process.env.WAVE_COUNTER_API_KEY,
  }),
)

app.listen(3000)
```

The router exposes:

```text
GET  /counters/{key}
POST /counters/{key}/events
GET  /counters/{key}/analytics?window=7d|1M|all
```

## Direct API

```ts
import { WaveCounter } from '@waves-counter/node'

const counter = new WaveCounter({
  databasePath: './app.sqlite3',
  initialCounts: { coffee: 67 },
})

const before = await counter.getCounter('coffee')

const result = await counter.recordEvent(
  'coffee',
  '0198f2f7-6d42-7d94-b1a6-e4305543f132',
)

const analytics = await counter.analytics('coffee', '7d')

counter.close()
```

`recordEvent` returns `{ counter, created }`. Reusing the same event ID returns `created: false` and does not increment again.

Call `close()` when you need deterministic teardown, such as tests or short-lived scripts that delete the SQLite file immediately afterward. Long-running servers can let process shutdown release the engine naturally.

## Options

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `databasePath` | `string` | `./wave-counter.sqlite3` | SQLite database file. |
| `initialCounts` | `Record<string, number>` | `{}` | Baseline totals inserted once for new counters. |
| `busyTimeoutMs` | `number` | Engine default | SQLite busy timeout before returning a retryable `busy` error. |

## Error handling

Storage and validation failures throw `WaveCounterError`:

```ts
try {
  await counter.recordEvent('coffee', eventId)
} catch (error) {
  if (error instanceof WaveCounterError && error.code === 'busy') {
    // Retry later.
  }
}
```

The Express router maps invalid counter keys, event IDs, and analytics windows to `400`; storage pressure to `503` with `Retry-After: 1`; and authorization failures to `403`.

## Operations

- The engine creates only `waves_*` tables in the supplied SQLite database.
- WAL mode and foreign keys are enabled by the engine.
- Analytics include real events only. Imported baselines do not fabricate history.
- Hosts own authentication, CORS, rate limiting, backups, and durable volume configuration.
- Keep the database on persistent storage in production deployments.

## Frontend packages

- [`@waves-counter/client`](https://www.npmjs.com/package/@waves-counter/client): framework-neutral browser client.
- [`@waves-counter/react`](https://www.npmjs.com/package/@waves-counter/react): accessible React component and hook.
- [`@waves-counter/vue`](https://www.npmjs.com/package/@waves-counter/vue): accessible Vue component and composable.

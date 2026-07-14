# Wave Counter

Self-hosted anonymous counters for websites and apps.

Wave Counter gives you atomic SQLite persistence, idempotent events, seven-day UTC analytics, FastAPI and Express routers, a framework-neutral browser client, and accessible React and Vue components. The storage engine is shared across Python and Node through Rust, while the host app keeps ownership of authentication, CORS, rate limiting, deployment, backups, and the SQLite file.

## Packages

| Package | Use it for |
| --- | --- |
| [`wave-counter`](python/wave-counter/README.md) | Python bindings and an optional FastAPI router. |
| [`@waves-counter/node`](packages/node/README.md) | Native Node API and Express router. |
| [`@waves-counter/client`](packages/client/README.md) | Framework-neutral browser client and optimistic state controller. |
| [`@waves-counter/react`](packages/react/README.md) | Accessible React component and hook. |
| [`@waves-counter/vue`](packages/vue/README.md) | Accessible Vue component and composable. |

The public npm scope is [`@waves-counter`](https://www.npmjs.com/org/waves-counter).

## HTTP contract

Mount either backend router at a prefix you control, such as `/api/waves`. Both expose identical routes:

```text
GET  /counters/{key}
POST /counters/{key}/events
GET  /counters/{key}/analytics?window=7d
```

The event body is `{ "eventId": "<UUIDv7>" }`. A new event returns `201`; replaying the same ID returns `200` without incrementing again. Unknown counters read as virtual zero counters. Configured baseline counts are inserted once and never overwrite stored totals.

## FastAPI

Install the Python package with its optional router:

```bash
pip install "wave-counter[fastapi]"
```

```python
from fastapi import FastAPI, Request
from wave_counter import WaveCounter
from wave_counter.fastapi import create_router

app = FastAPI()
counter = WaveCounter(
    database_path="./app.sqlite3",
    initial_counts={"coffee": 67},
)

async def authorize(request: Request) -> bool:
    return request.headers.get("x-api-key") == "host-owned-secret"

app.include_router(
    create_router(counter, authorize=authorize),
    prefix="/api/waves",
)
```

## Node and Express

Install the Node package and Express:

```bash
npm install @waves-counter/node express
```

Then mount the router inside your app:

```ts
import express from 'express'
import { WaveCounter } from '@waves-counter/node'
import { createWaveRouter } from '@waves-counter/node/express'

const app = express()
const counter = new WaveCounter({
  databasePath: process.env.DB_PATH ?? './app.sqlite3',
  initialCounts: { coffee: 67 },
})

app.use(express.json())
app.use(
  '/api/waves',
  createWaveRouter(counter, {
    authorize: (request) => request.header('x-api-key') === process.env.API_KEY,
  }),
)
```

All Node database methods run as asynchronous native tasks rather than on the event-loop thread.

See [`@waves-counter/node`](packages/node/README.md) for the full Node API.

## React

```bash
npm install @waves-counter/react @waves-counter/client react react-dom
```

```tsx
import { WaveCounter } from '@waves-counter/react'
import '@waves-counter/react/styles.css'

export function CoffeeCounter() {
  return <WaveCounter counterKey="coffee" endpoint="/api/waves" onError={console.error} />
}
```

`useWaveCounter` provides the same optimistic state and actions for a custom React presentation. See [`@waves-counter/react`](packages/react/README.md) for component props, render props, styling, and SSR guidance.

## Vue

```bash
npm install @waves-counter/vue @waves-counter/client vue
```

```vue
<script setup lang="ts">
import { WaveCounter } from '@waves-counter/vue'
import '@waves-counter/vue/styles.css'
</script>

<template>
  <WaveCounter
    counter-key="coffee"
    endpoint="/api/waves"
    :show-stats="true"
    @error="console.error"
  />
</template>
```

Click records one event optimistically and reconciles with the authoritative total. Right click, long press, the Context Menu key, or Shift+F10 opens analytics. Escape, the close control, and outside pointer interaction dismiss the popover.

`useWaveCounter` exposes the same state without the default presentation:

```ts
const counter = useWaveCounter({
  counterKey: 'coffee',
  endpoint: '/api/waves',
})

counter.enableStats(true)
await counter.openStats()
counter.closeStats()
await counter.toggleStats()
```

CSS custom properties beginning with `--wave-counter-` control ink, muted text, surfaces, borders, accent, errors, radii, and motion timing. Slots named `icon` and `analytics`, plus the default button slot, provide structural customization.

See [`@waves-counter/react`](packages/react/README.md), [`@waves-counter/vue`](packages/vue/README.md), and [`@waves-counter/client`](packages/client/README.md) for the full frontend APIs.

## Persistence and operations

- The engine creates only `waves_*` tables in the supplied database.
- Connections enable foreign keys, require WAL mode, and use a configurable busy timeout.
- A busy timeout maps to `503` with `Retry-After: 1` in both routers.
- Analytics include real events only. Imported baselines do not fabricate history.
- With no database path, the engine uses `./wave-counter.sqlite3`.

Authentication, CORS, rate limiting, abuse prevention, backups, and durable volume configuration belong to the host application.

## Development

Required tools are Rust stable, Node 20 or newer, npm 11, Python 3.10 or newer, and uv.

```bash
npm install
cargo test --workspace
uv run --project python/wave-counter pytest
npm test --workspace @waves-counter/client
npm test --workspace @waves-counter/react
npm test --workspace @waves-counter/vue
npm test --workspace @waves-counter/node
npm test --workspace @waves-counter/playground
```

`npm run check` validates coordinated versions, shared conformance scenarios, package manifests, and release workflows.

## Releases

Tags named `v<version>` build Python wheels and Node prebuilds on Linux, macOS, and Windows. PyPI and npm publishing use OIDC trusted publishers. Configure the `release.yml` workflow as the trusted publisher for `wave-counter` on PyPI and each npm package before pushing the first tag.

The npm scope is `@waves-counter`. Configure the `release.yml` workflow as a trusted publisher for each npm package before pushing the first release tag.

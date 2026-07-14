# @waves-counter/client

Framework-neutral browser client and state controller for Wave Counter.

Use this package when you want to talk to a Wave Counter HTTP endpoint from any browser UI: vanilla TypeScript, React, Svelte, custom elements, or a design system component of your own. If you use Vue, start with [`@waves-counter/vue`](https://www.npmjs.com/package/@waves-counter/vue) instead; it is built on top of this package.

## Install

```bash
npm install @waves-counter/client
```

## What it does

- Calls the Wave Counter HTTP contract: read totals, record idempotent events, and load `7d`, `1M`, or `all` analytics.
- Generates UUIDv7 event IDs by default so retrying an increment does not double-count.
- Exposes a small `WaveCounterController` for optimistic UI state, pending increments, analytics popovers, and errors.
- Has no framework dependency and no opinion about auth, routing, styling, or deployment.

## Quick start

```ts
import { WaveCounterClient, WaveCounterController } from '@waves-counter/client'

const transport = new WaveCounterClient({
  endpoint: '/api/waves',
})

const counter = new WaveCounterController('coffee', transport)

counter.subscribe((state) => {
  document.querySelector('[data-total]')!.textContent =
    state.counter?.total.toString() ?? '—'
})

await counter.load()

document.querySelector('button')!.addEventListener('click', () => {
  void counter.increment().catch(console.error)
})
```

## HTTP endpoint expected by the client

Mount a Wave Counter backend at any prefix and pass that prefix as `endpoint`.

```text
GET  /counters/{key}
POST /counters/{key}/events
GET  /counters/{key}/analytics?window=7d|1M|all
```

The event request body is:

```json
{ "eventId": "0198f2f7-6d42-7d94-b1a6-e4305543f132" }
```

A new event returns `201`. Replaying the same event ID returns `200` and the same authoritative counter total.

## `WaveCounterClient`

```ts
const client = new WaveCounterClient({
  endpoint: '/api/waves',
  fetch: window.fetch,
  eventId: () => crypto.randomUUID(),
})
```

| Option | Required | Description |
| --- | --- | --- |
| `endpoint` | Yes | Base URL where the Wave Counter routes are mounted. Trailing slashes are removed. |
| `fetch` | No | Custom fetch implementation for tests, auth wrappers, or non-browser runtimes. |
| `eventId` | No | Function used by `increment()`. Defaults to UUIDv7. |

Methods:

```ts
await client.getCounter('coffee')
await client.recordEvent('coffee', '0198f2f7-6d42-7d94-b1a6-e4305543f132')
await client.increment('coffee')
await client.getAnalytics('coffee')
await client.getAnalytics('coffee', '1M')
```

Failed HTTP responses throw `WaveCounterHttpError` with `status`, `code`, and `retryAfter`.

## `WaveCounterController`

The controller is useful when the UI should feel instant while the backend remains authoritative.

```ts
const controller = new WaveCounterController('coffee', client, {
  showStats: true,
})

const unsubscribe = controller.subscribe((state) => {
  state.counter          // latest total plus pending optimistic increments
  state.pendingIncrements
  state.loading
  state.error
  state.analytics
  state.analyticsWindow
  state.analyticsLoading
  state.analyticsError
  state.statsOpen
})

await controller.load()
await controller.increment()
await controller.openStats()
await controller.setAnalyticsWindow('all')
controller.closeStats()
unsubscribe()
```

## TypeScript types

The package ships its own declarations. Useful exported types include `CounterSnapshot`, `Analytics`, `AnalyticsPoint`, `AnalyticsWindow`, `WaveCounterTransport`, `WaveCounterState`, and `WaveCounterListener`.

## Production notes

- Put authentication, CORS, rate limiting, and bot protection in your host application.
- Use stable counter keys such as `coffee`, `likes`, or `downloads`. Keys are URL-encoded by the client.
- Handle `WaveCounterHttpError.code === 'busy'` as a retryable storage-pressure response. Backends include `Retry-After: 1`.
- If you wrap `fetch` to add credentials or headers, keep the idempotent event ID behavior intact.

## Related packages

- [`@waves-counter/vue`](https://www.npmjs.com/package/@waves-counter/vue): accessible Vue component and composable.
- `@waves-counter/node`: native Node and Express backend integration.
- `wave-counter`: Python bindings and FastAPI integration.

# @waves-counter/vue

Accessible Vue component and composable for Wave Counter.

Use it to drop an optimistic counter button into a Vue app, backed by your own Wave Counter API. The component includes keyboard and pointer interactions, a seven-day analytics popover, default styles, and customization hooks.

## Install

```bash
npm install @waves-counter/vue @waves-counter/client vue
```

`vue` is a peer dependency. The package includes TypeScript declarations and a CSS file.

## Quick start

```vue
<script setup lang="ts">
import { WaveCounter } from '@waves-counter/vue'
import '@waves-counter/vue/styles.css'
</script>

<template>
  <WaveCounter
    counter-key="coffee"
    endpoint="/api/waves"
    @error="console.error"
  />
</template>
```

`endpoint` should point at a Wave Counter backend mounted with this HTTP contract:

```text
GET  /counters/{key}
POST /counters/{key}/events
GET  /counters/{key}/analytics?window=7d
```

## Component behavior

- Click or tap records one event optimistically, then reconciles with the backend total.
- Right click, long press, the Context Menu key, or Shift+F10 opens analytics.
- Escape, the close button, or outside pointer interaction closes the analytics popover.
- Analytics are requested only when stats are enabled and opened.
- Loading, unavailable, and analytics error states are announced through accessible status text.

## Props

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `counterKey` | `string` | Required | Counter key sent to the API. |
| `endpoint` | `string` | Required | Base URL where Wave Counter routes are mounted. |
| `theme` | `'auto' \| 'light' \| 'dark'` | `'auto'` | Color mode. Auto follows `prefers-color-scheme`; explicit light and dark ignore the OS setting. |
| `icon` | `Component` | Coffee icon | Component rendered inside the trigger. |
| `showStats` | `boolean` | `true` | Enables analytics interactions and popover. |
| `longPressMs` | `number` | `550` | Touch long-press delay before opening analytics. |
| `transport` | `WaveCounterTransport` | Generated client | Custom transport for tests or advanced integrations. |

## Events

| Event | Payload | Description |
| --- | --- | --- |
| `error` | `Error` | Emitted when initial loading or incrementing fails. Analytics errors stay in the popover so users can retry. |

## Slots

```vue
<WaveCounter counter-key="coffee" endpoint="/api/waves">
  <template #icon>
    <span aria-hidden="true">🌊</span>
  </template>

  <template #default="{ total, pending, unavailable }">
    {{ unavailable ? 'Offline' : total }}
    <small v-if="pending">syncing…</small>
  </template>

  <template #analytics="{ analytics, loading, error, retry }">
    <p v-if="loading">Loading…</p>
    <button v-else-if="error" type="button" @click="retry">Retry</button>
    <pre v-else>{{ analytics }}</pre>
  </template>
</WaveCounter>
```

## `useWaveCounter`

Use the composable when you want your own presentation.

```ts
import { useWaveCounter } from '@waves-counter/vue'

const wave = useWaveCounter({
  counterKey: 'coffee',
  endpoint: '/api/waves',
  showStats: true,
})

await wave.load()
await wave.increment()
await wave.openStats()
wave.closeStats()
```

Returned refs and methods:

```ts
wave.state
wave.counter
wave.analytics
wave.loading
wave.pendingIncrements
wave.analyticsLoading
wave.statsEnabled
wave.statsOpen
wave.error
wave.analyticsError
wave.load()
wave.increment()
wave.enableStats(false)
wave.openStats()
wave.closeStats()
wave.toggleStats()
wave.loadAnalytics()
```

## Styling

Import the default stylesheet once:

```ts
import '@waves-counter/vue/styles.css'
```

Choose a color mode with `theme`. The default is `auto`, which follows the visitor's OS preference.

```vue
<WaveCounter counter-key="coffee" endpoint="/api/waves" theme="auto" />
<WaveCounter counter-key="coffee" endpoint="/api/waves" theme="light" />
<WaveCounter counter-key="coffee" endpoint="/api/waves" theme="dark" />
```

Theme with CSS custom properties on the component or a parent element:

```css
.my-counter {
  --wave-counter-ink: oklch(24% 0.02 250);
  --wave-counter-muted: oklch(54% 0.03 250);
  --wave-counter-surface: oklch(98% 0.006 250);
  --wave-counter-raised: oklch(99% 0.004 250);
  --wave-counter-border: oklch(88% 0.02 250);
  --wave-counter-color: oklch(68% 0.16 205);
  --wave-counter-color-strong: oklch(48% 0.15 205);
  --wave-counter-radius: 999px;
  --wave-counter-popover-radius: 1rem;
  --wave-counter-popover-duration: 220ms;
}
```

For theme-specific overrides, set the base variables for both modes or use the `*-dark` fallbacks:

```css
.my-counter {
  --wave-counter-surface: oklch(98% 0.006 250);
  --wave-counter-surface-dark: oklch(25% 0.018 250);
  --wave-counter-color: oklch(62% 0.14 205);
  --wave-counter-color-dark: oklch(74% 0.11 205);
}
```

## Production notes

- Keep API authorization, CORS, abuse prevention, and rate limiting in your host app.
- The package does not collect user identity or browser fingerprints.
- Counter increments are idempotent at the transport layer, so transient network retries should not double-count.
- For SSR, render the component normally but call counter actions only in the browser.

## Related packages

- [`@waves-counter/client`](https://www.npmjs.com/package/@waves-counter/client): framework-neutral browser client and controller.
- `@waves-counter/node`: native Node and Express backend integration.
- `wave-counter`: Python bindings and FastAPI integration.

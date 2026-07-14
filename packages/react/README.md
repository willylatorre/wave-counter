# @waves-counter/react

Accessible React component and hook for Wave Counter.

Use it to add an optimistic counter button to a React app backed by your own Wave Counter API. The component includes keyboard and pointer interactions, a seven-day analytics popover, default styles, and render props for custom presentation.

## Install

```bash
npm install @waves-counter/react @waves-counter/client react react-dom
```

`react` and `react-dom` are peer dependencies. The package includes TypeScript declarations and a CSS file.

## Quick start

```tsx
import { WaveCounter } from '@waves-counter/react'
import '@waves-counter/react/styles.css'

export function CoffeeCounter() {
  return (
    <WaveCounter
      counterKey="coffee"
      endpoint="/api/waves"
      onError={console.error}
    />
  )
}
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
| `theme` | `'auto' \| 'light' \| 'dark'` | `'auto'` | Color mode. Auto follows `prefers-color-scheme`. |
| `icon` | `ReactNode \| () => ReactNode` | Coffee icon | Icon rendered inside the trigger. |
| `showStats` | `boolean` | `true` | Enables analytics interactions and popover. |
| `longPressMs` | `number` | `550` | Touch long-press delay before opening analytics. |
| `transport` | `WaveCounterTransport` | Generated client | Custom transport for tests or advanced integrations. |
| `onError` | `(error: Error) => void` | — | Called when initial loading or incrementing fails. |
| `children` | render prop | Default total | Renders custom trigger content. |
| `renderIcon` | `() => ReactNode` | — | Renders a custom trigger icon. |
| `renderAnalytics` | render prop | Default analytics UI | Renders custom analytics content. |

## Render props

Use render props when the default component structure does not fit your design:

```tsx
<WaveCounter
  counterKey="coffee"
  endpoint="/api/waves"
  renderIcon={() => <span aria-hidden="true">🌊</span>}
  renderAnalytics={({ analytics, loading, error, retry }) => {
    if (loading) return <p>Loading activity…</p>
    if (error) return <button onClick={() => void retry()}>Retry</button>
    return <p>{analytics?.total ?? 0} events this week</p>
  }}
>
  {({ total, pending, unavailable }) => (
    <>
      {unavailable ? 'Offline' : total}
      {pending > 0 && <small> syncing…</small>}
    </>
  )}
</WaveCounter>
```

## `useWaveCounter`

Use the hook when you want complete control over presentation:

```tsx
import { useEffect } from 'react'
import { useWaveCounter } from '@waves-counter/react'

export function CoffeeCounter() {
  const wave = useWaveCounter({ counterKey: 'coffee', endpoint: '/api/waves', showStats: true })

  useEffect(() => {
    void wave.load()
  }, [])

  return <button onClick={() => void wave.increment()}>{wave.counter?.total ?? '—'}</button>
}
```

The hook returns `counter`, `analytics`, `loading`, `pendingIncrements`, `analyticsLoading`, `statsEnabled`, `statsOpen`, `error`, `analyticsError`, and the `load`, `increment`, `enableStats`, `openStats`, `closeStats`, `toggleStats`, and `loadAnalytics` actions.

## Styling

Import the default stylesheet once:

```tsx
import '@waves-counter/react/styles.css'
```

Choose a color mode with `theme`. The default is `auto`, which follows the visitor's OS preference.

```tsx
<WaveCounter counterKey="coffee" endpoint="/api/waves" theme="auto" />
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
  --wave-counter-radius: 0.875rem;
  --wave-counter-popover-radius: 1rem;
  --wave-counter-popover-duration: 220ms;
}
```

For dark-mode-specific overrides, use the `*-dark` fallbacks such as `--wave-counter-surface-dark` and `--wave-counter-color-dark`.

## Production notes

- Keep API authorization, CORS, abuse prevention, and rate limiting in your host app.
- The package does not collect user identity or browser fingerprints.
- Counter increments are idempotent at the transport layer, so transient network retries should not double-count.
- For SSR, render the component normally but call `load`, `increment`, and analytics actions only in browser effects or event handlers.

## Related packages

- [`@waves-counter/client`](https://www.npmjs.com/package/@waves-counter/client): framework-neutral browser client and controller.
- [`@waves-counter/vue`](https://www.npmjs.com/package/@waves-counter/vue): accessible Vue component and composable.
- [`@waves-counter/node`](https://www.npmjs.com/package/@waves-counter/node): native Node and Express backend integration.
- `wave-counter`: Python bindings and FastAPI integration.

# Wave Counter React Design

## Summary

Add `@waves-counter/react`, a React adapter that matches the Vue package's public capabilities: a polished `WaveCounter` component and a headless `useWaveCounter` hook. Both layers reuse the framework-neutral `@waves-counter/client` controller for HTTP communication, optimistic reconciliation, analytics, and state transitions.

The npm scope remains plural because `@wave-counter` is unavailable. The product, component, and API names remain singular: Wave Counter, `WaveCounter`, and `useWaveCounter`.

## Goals

- Publish `@waves-counter/react` with React as a peer dependency and `@waves-counter/client` as an internal dependency.
- Provide `WaveCounter` and `useWaveCounter` with behavior equivalent to their Vue counterparts.
- Reuse the same CSS selectors and `--wave-counter-*` custom-property contract as Vue so visual theming stays portable between adapters.
- Preserve keyboard, pointer, touch, focus, reduced-motion, and error behavior from the Vue component.
- Keep the client/controller as the only source of transport and state-management logic.

## Non-goals

- Do not change the HTTP contract, client package, backend packages, or Vue public API.
- Do not introduce a framework-neutral rendering abstraction.
- Do not add a React playground or a new documentation website in this change.
- Do not support server-side rendering beyond avoiding browser access during render; component interaction remains client-side.

## Package Surface

`packages/react` contains the package manifest, TypeScript configuration, Vite library build configuration, component source, hook source, tests, README, and a `styles.css` entry point.

The package exports:

```ts
export { WaveCounter, useWaveCounter } from '@waves-counter/react'
export type {
  UseWaveCounterOptions,
  UseWaveCounterResult,
  WaveCounterProps,
  WaveCounterTheme,
} from '@waves-counter/react'

import '@waves-counter/react/styles.css'
```

`react` and `react-dom` are peer dependencies. The package targets the current supported React major and does not bundle React.

## Hook

`useWaveCounter(options)` accepts the same functional inputs as Vue:

- `counterKey: string`
- `endpoint?: string`, defaulting to `/api/waves`
- `showStats?: boolean`, defaulting to enabled
- `transport?: WaveCounterTransport`

When no transport is supplied, the hook creates `WaveCounterClient` using the endpoint. It creates one `WaveCounterController` per stable configuration, subscribes via `useSyncExternalStore`, and destroys the subscription when React unmounts the hook. The returned state exposes the controller snapshot fields (`counter`, `analytics`, loading/pending flags, stats flags, and errors) and methods (`load`, `increment`, `enableStats`, `openStats`, `closeStats`, `toggleStats`, and `loadAnalytics`).

The returned controller must remain stable between ordinary state updates. Consumers changing `counterKey`, endpoint, transport, or initial `showStats` should remount the hook/component with a new React `key`; runtime analytics enablement is controlled through `enableStats`.

## Component

`WaveCounter` accepts React equivalents of the Vue component inputs:

- `counterKey` and `endpoint`
- `theme`: `auto`, `light`, or `dark`; defaults to `auto`
- `icon`: a React node or render function; default is the built-in coffee icon
- `showStats`; defaults to `true`
- `longPressMs`; defaults to `550`
- `transport` for tests and advanced integration
- `onError(error)` callback

It also supports React render props for presentation customization:

- `children({ total, pending, unavailable })` replaces the default total content.
- `renderIcon()` replaces the default icon area.
- `renderAnalytics({ analytics, loading, error, retry })` replaces the popover content.

The root uses `wave-counter` and the same state data attributes as Vue. It renders the same button semantics, accessible text, statistics dialog, close control, loading/error states, SVG line chart, date range, comparison text, and visually-hidden analytics summary.

Interaction parity is required:

- Mount loads the counter total.
- Click increments optimistically and calls `onError` if it fails.
- Right click, touch long press, Context Menu, and Shift+F10 open analytics when enabled.
- Movement beyond 10px cancels a touch long press.
- Escape, outside pointer interaction, and the close control dismiss analytics; close restores focus to the trigger.
- Keyboard-triggered opening disables the entrance transition. Pointer opening animates the chart once.
- The popover position is horizontally clamped to the viewport when open and recalculated on resize.

## Styling

`@waves-counter/react/styles.css` is copied from the Vue package without changing class names, state attributes, CSS variables, or design tokens. React controls the enter/exit class lifecycle required by the existing `.wave-popover-*` transition rules. The stylesheet preserves light, dark, and automatic themes, host override variables, focus styling, and reduced-motion behavior.

## Error Handling

The initial load produces the same neutral unavailable UI as Vue. An increment failure is rolled back by the shared controller and reported to `onError`. Analytics errors remain visible inside the dialog and retry through the shared `loadAnalytics` method. Unknown thrown values are normalized to `Error` before invoking the callback.

## Testing and Verification

Unit tests verify hook subscription updates, controller methods, cleanup, default transport construction, and custom transport use. Component tests cover initial loading, optimistic updates and rollback, error callbacks, statistics interaction by context menu, long press, and keyboard, focus restoration, outside dismissal, analytics retry, render props, theme attributes, and stylesheet export/required selectors.

Package checks confirm the public package metadata, coordinated version, React peer dependency, CSS export, and no bundled React. The root typecheck, package test suite, and package build must pass.

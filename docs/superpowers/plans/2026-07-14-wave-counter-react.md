# Wave Counter React Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@waves-counter/react`, with a headless hook and accessible, styled Wave Counter component matching the Vue adapter.

**Architecture:** The React adapter creates and subscribes to `WaveCounterController` from `@waves-counter/client`; it does not reproduce transport or optimistic-state logic. `WaveCounter` consumes the hook and implements the established interaction, popover, chart, and theming contract with React DOM handlers. The package reuses the Vue stylesheet unchanged.

**Tech Stack:** React 19, TypeScript, Vite library mode, Vitest, Testing Library, jsdom, `@waves-counter/client`.

## Global Constraints

- Keep Wave Counter names singular; use the existing plural npm scope: `@waves-counter/react`.
- Use `@waves-counter/client` as the only transport and controller implementation.
- React and React DOM are peer dependencies and must not be bundled.
- Export `./styles.css` and preserve the existing `wave-counter` classes and `--wave-counter-*` CSS variables exactly.
- Match Vue interaction, accessibility, error, focus, and theme behavior.
- Keep all public packages at the root version (`0.1.2` until the next coordinated release changes it).

---

### Task 1: Scaffold the React package and headless hook

**Files:**
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/vite.config.ts`
- Create: `packages/react/src/useWaveCounter.ts`
- Create: `packages/react/src/index.ts`
- Create: `packages/react/test/useWaveCounter.test.tsx`
- Modify: `tooling/check-versions.mjs`
- Modify: `tooling/check-packages.mjs`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: `WaveCounterClient`, `WaveCounterController`, `WaveCounterState`, and `WaveCounterTransport` from `@waves-counter/client`.
- Produces: `useWaveCounter(options): UseWaveCounterResult`, returning a `Readonly<WaveCounterState>` plus the controller methods.

- [ ] **Step 1: Write failing hook tests**

```tsx
import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { WaveCounterTransport } from '@waves-counter/client'
import { useWaveCounter } from '../src/index.js'

test('exposes controller state and methods', async () => {
  const transport: WaveCounterTransport = {
    getCounter: vi.fn().mockResolvedValue({ key: 'coffee', total: 4, updatedAt: null }),
    increment: vi.fn().mockResolvedValue({ key: 'coffee', total: 5, updatedAt: null }),
    getAnalytics: vi.fn().mockResolvedValue({ key: 'coffee', window: '7d', interval: 'day', timezone: 'UTC', total: 4, previousTotal: 2, changePercentage: 100, points: [] }),
  }
  const { result } = renderHook(() => useWaveCounter({ counterKey: 'coffee', transport }))
  await act(() => result.current.load())
  expect(result.current.counter?.total).toBe(4)
  await act(() => result.current.openStats())
  expect(result.current.statsOpen).toBe(true)
  expect(result.current.analytics?.total).toBe(4)
})
```

- [ ] **Step 2: Run the hook test to verify failure**

Run: `npm test --workspace @waves-counter/react -- useWaveCounter.test.tsx`

Expected: FAIL because the package and `useWaveCounter` do not exist.

- [ ] **Step 3: Create package configuration and implement the hook**

`packages/react/package.json` must declare `@waves-counter/react` at version `0.1.2`, export `.` and `./styles.css`, depend on `@waves-counter/client: 0.1.2`, peer-depend on `react` and `react-dom` at `^19.0.0`, and provide `build`, `test`, and `typecheck` scripts matching the Vue package. Configure Vite library mode with `react`, `react-dom`, and `@waves-counter/client` external.

Implement the hook with a stable controller and `useSyncExternalStore`:

```ts
export interface UseWaveCounterOptions {
  counterKey: string
  endpoint?: string
  showStats?: boolean
  transport?: WaveCounterTransport
}

export interface UseWaveCounterResult extends Readonly<WaveCounterState> {
  load: () => Promise<void>
  increment: () => Promise<void>
  enableStats: (enabled: boolean) => void
  openStats: () => Promise<void>
  closeStats: () => void
  toggleStats: () => Promise<void>
  loadAnalytics: () => Promise<void>
}

export function useWaveCounter(options: UseWaveCounterOptions): UseWaveCounterResult {
  const controller = useMemo(
    () => new WaveCounterController(
      options.counterKey,
      options.transport ?? new WaveCounterClient({ endpoint: options.endpoint ?? '/api/waves' }),
      options.showStats === undefined ? {} : { showStats: options.showStats },
    ),
    [options.counterKey, options.endpoint, options.showStats, options.transport],
  )
  const state = useSyncExternalStore(controller.subscribe.bind(controller), () => controller.snapshot)
  return { ...state, load: () => controller.load(), increment: () => controller.increment(), enableStats: (enabled) => controller.enableStats(enabled), openStats: () => controller.openStats(), closeStats: () => controller.closeStats(), toggleStats: () => controller.toggleStats(), loadAnalytics: () => controller.loadAnalytics() }
}
```

Export the hook and its public types from `src/index.ts`. Do not import styles from the index; consumers explicitly import the CSS subpath.

- [ ] **Step 4: Extend package guards**

Add `@waves-counter/react` and `packages/react/package.json` to `PUBLIC_PACKAGES`. Include `react` in the manifests loaded by `validatePackages`, assert that it exports `./styles.css`, declares a React 19 peer, and has no `react` dependency. Update all release-package arrays so CI and release publish `packages/react` with the existing packages.

- [ ] **Step 5: Run hook, type, and package checks**

Run: `npm test --workspace @waves-counter/react -- useWaveCounter.test.tsx && npm run typecheck --workspace @waves-counter/react && npm run check`

Expected: PASS, including package metadata validation for React.

- [ ] **Step 6: Commit the headless adapter**

```bash
git add packages/react tooling/check-versions.mjs tooling/check-packages.mjs package-lock.json .github
git commit -m "feat(react): add wave counter hook"
```

### Task 2: Build the styled React component and chart

**Files:**
- Create: `packages/react/src/WaveCounter.tsx`
- Create: `packages/react/src/AnalyticsChart.tsx`
- Create: `packages/react/src/CoffeeIcon.tsx`
- Create: `packages/react/src/styles.css`
- Create: `packages/react/test/WaveCounter.test.tsx`
- Modify: `packages/react/src/index.ts`

**Interfaces:**
- Consumes: `useWaveCounter(options): UseWaveCounterResult` from Task 1 and `Analytics`/`WaveCounterTransport` from the client package.
- Produces: `WaveCounter(props: WaveCounterProps): ReactElement`, `AnalyticsChart`, and default stylesheet export.

- [ ] **Step 1: Write failing component tests**

```tsx
test('loads, increments optimistically, and reconciles', async () => {
  const user = userEvent.setup()
  let resolveIncrement!: (snapshot: CounterSnapshot) => void
  render(<WaveCounter counterKey="coffee" endpoint="/api/waves" transport={transport({ increment: vi.fn().mockReturnValue(new Promise(resolve => { resolveIncrement = resolve })) })} />)
  await user.click(await screen.findByRole('button'))
  expect(screen.getByTestId('total')).toHaveTextContent('1')
  await act(() => resolveIncrement({ key: 'coffee', total: 7, updatedAt: null }))
  expect(screen.getByTestId('total')).toHaveTextContent('7')
})

test('opens analytics by context menu and restores focus on Escape', async () => {
  const user = userEvent.setup()
  render(<WaveCounter counterKey="coffee" endpoint="/api/waves" transport={transport()} />)
  const trigger = await screen.findByRole('button')
  fireEvent.contextMenu(trigger)
  expect(await screen.findByRole('dialog', { name: 'Coffee statistics' })).toBeVisible()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})
```

Include tests for increment rollback and `onError`, ContextMenu and Shift+F10, touch long press/cancellation after 10px movement, outside-pointer dismissal, analytics retry, `showStats={false}`, theme attributes, default coffee SVG, render props, accessible summary, chart `aria-hidden`, popover clamping, and stylesheet media/selectors.

- [ ] **Step 2: Run component tests to verify failure**

Run: `npm test --workspace @waves-counter/react -- WaveCounter.test.tsx`

Expected: FAIL because `WaveCounter` is not exported.

- [ ] **Step 3: Implement component, chart, and icon**

Implement a React component that has the Vue-equivalent DOM, classes, attributes, labels, and interaction handlers. It must:

```tsx
export interface WaveCounterProps {
  counterKey: string
  endpoint: string
  theme?: 'auto' | 'light' | 'dark'
  icon?: ReactNode | (() => ReactNode)
  showStats?: boolean
  longPressMs?: number
  transport?: WaveCounterTransport
  onError?: (error: Error) => void
  children?: (state: { total: number; pending: number; unavailable: boolean }) => ReactNode
  renderIcon?: () => ReactNode
  renderAnalytics?: (state: { analytics: Analytics | null; loading: boolean; error: Error | null; retry: () => Promise<void> }) => ReactNode
}
```

Use refs for root, trigger, popover, long-press timer, pointer origin, and captured pointer ID. Register `document` outside-pointer and `window` resize handlers only while mounted. Use a layout effect to measure the open popover and set `--wave-popover-offset-x`. Implement state-driven enter/exit classes compatible with `.wave-popover-enter-*` and `.wave-popover-leave-*`; delay unmount until the exit duration completes, but skip timing for keyboard openings and reduced motion. `AnalyticsChart` calculates its 240×88 SVG points from `analytics.points`, including a minimum max value of 1, and renders the same baseline, polyline, and circles as Vue. `CoffeeIcon` renders the same inline SVG and `data-wave-coffee-icon` attribute.

- [ ] **Step 4: Copy the Vue stylesheet without semantic changes**

Run: `cp packages/vue/src/styles.css packages/react/src/styles.css`

Do not rename classes, data attributes, custom properties, media queries, or color tokens. The React component must provide every selector state used by the stylesheet.

- [ ] **Step 5: Export and verify UI behavior**

Update `src/index.ts` to export `WaveCounter`, `AnalyticsChart`, component types, hook, and hook types. Run:

```bash
npm test --workspace @waves-counter/react -- WaveCounter.test.tsx
npm run typecheck --workspace @waves-counter/react
npm run build --workspace @waves-counter/react
```

Expected: all commands pass.

- [ ] **Step 6: Commit the visual adapter**

```bash
git add packages/react
git commit -m "feat(react): add accessible wave counter component"
```

### Task 3: Document, integrate, and run the full verification suite

**Files:**
- Create: `packages/react/README.md`
- Modify: `README.md`
- Modify: `packages/node/README.md`
- Modify: `packages/vue/README.md`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`
- Modify: `apps/playground/package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: completed `@waves-counter/react` exports from Tasks 1 and 2.
- Produces: documentation, release coverage, and root-package references that treat React as a first-class adapter.

- [ ] **Step 1: Write documentation/package guard tests that fail before integration**

Extend `tooling/checks.test.mjs` to create a React manifest and assert it is version-checked and package-validated. Add assertions that release configuration contains `packages/react` and root documentation lists `@waves-counter/react`.

- [ ] **Step 2: Run tests to verify the integration gap**

Run: `node --test tooling/checks.test.mjs`

Expected: FAIL until fixture expectations and integration references include React.

- [ ] **Step 3: Add consumer documentation and release wiring**

Write `packages/react/README.md` using the Vue README structure, with React installation, an import example, prop table, render-prop example, hook example, styling instructions, SSR note, and related packages. Add `@waves-counter/react` to the root packages table and related-package sections. Include the React package in CI workspace tests/typechecks/builds and in release scope preparation and publishing. Add it to the playground workspace dependencies only if the playground can use it without replacing its existing Vue demo; otherwise keep the playground unchanged.

- [ ] **Step 4: Run complete verification**

Run:

```bash
npm run check
npm run test:tooling
npm test --workspace @waves-counter/client
npm test --workspace @waves-counter/vue
npm test --workspace @waves-counter/react
npm run typecheck --workspace @waves-counter/react
npm run build --workspace @waves-counter/react
npm run build
```

Expected: every command exits 0. If lockfile changes are necessary, run `npm install --package-lock-only` and rerun the suite.

- [ ] **Step 5: Commit the integrated package**

```bash
git add README.md packages/react tooling .github package-lock.json packages/node/README.md packages/vue/README.md
git commit -m "feat: publish react wave counter adapter"
```

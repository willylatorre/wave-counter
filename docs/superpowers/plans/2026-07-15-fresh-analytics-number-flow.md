# Fresh Analytics and Number Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revalidate displayed analytics after events and animate the default popover total when its window changes.

**Architecture:** The shared controller owns analytics freshness and request ordering. React and Vue retain the last payload during refresh, announce the refresh, and use their own Number Flow adapter for the default popover total.

**Tech Stack:** TypeScript, Vitest, React 19, Vue 3, `@number-flow/react`, `@number-flow/vue`.

## Global Constraints

- Preserve the shared controller as the only source of analytics data and freshness.
- Do not change the HTTP analytics contract or add cache headers.
- Retain current analytics during refresh; show the blocking loader only before the first successful payload.
- Ignore superseded analytics responses, including their loading and error updates.
- Keep Number Flow framework-specific and retain its default reduced-motion preference behavior.

---

## File structure

- `packages/client/src/controller.ts`: analytics request versioning and post-increment revalidation.
- `packages/client/test/controller.test.ts`: controller regression coverage.
- `packages/react/{package.json,src/WaveCounter.tsx,test/WaveCounter.test.tsx}`: React dependency, animated total, retained refresh UI.
- `packages/vue/{package.json,src/WaveCounter.vue,test/WaveCounter.test.ts}`: Vue dependency, animated total, retained refresh UI.
- `package-lock.json`: resolved Number Flow dependencies.

### Task 1: Make analytics revalidation race-safe in the shared controller

**Files:**
- Modify: `packages/client/src/controller.ts:20-128`
- Modify: `packages/client/test/controller.test.ts:153-184`

**Interfaces:**
- Consumes: `WaveCounterTransport.getAnalytics(key, window): Promise<Analytics>`.
- Produces: `openStats()` always fetches; a successful `increment()` refreshes open stats; only the latest request updates state.

- [ ] **Step 1: Write failing tests**

```ts
test('revalidates cached analytics each time stats opens', async () => {
  const getAnalytics = vi.fn().mockResolvedValue(analytics)
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))
  await controller.openStats()
  controller.closeStats()
  await controller.openStats()
  expect(getAnalytics).toHaveBeenCalledTimes(2)
})

test('refreshes open analytics after a successful increment', async () => {
  const getAnalytics = vi.fn().mockResolvedValue(analytics)
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))
  await controller.openStats()
  await controller.increment()
  expect(getAnalytics).toHaveBeenCalledTimes(2)
})

test('keeps the latest analytics response when refreshes race', async () => {
  let resolveFirst!: (value: Analytics) => void
  let resolveSecond!: (value: Analytics) => void
  const getAnalytics = vi.fn()
    .mockReturnValueOnce(new Promise<Analytics>((resolve) => { resolveFirst = resolve }))
    .mockReturnValueOnce(new Promise<Analytics>((resolve) => { resolveSecond = resolve }))
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))
  const first = controller.openStats()
  const second = controller.loadAnalytics()
  resolveSecond(analyticsFor('all'))
  await second
  resolveFirst(analytics)
  await first
  expect(controller.snapshot.analytics).toEqual(analyticsFor('all'))
})
```

- [ ] **Step 2: Run red tests**

Run: `npm test --workspace @waves-counter/client -- controller.test.ts`

Expected: FAIL because cached analytics are reused, increments do not fetch analytics, and an older response can overwrite a newer one.

- [ ] **Step 3: Implement the minimal controller behavior**

```ts
// Add alongside #authoritative.
#analyticsRequest = 0

async openStats(): Promise<void> {
  if (!this.#state.statsEnabled) return
  this.#update({ statsOpen: true })
  await this.loadAnalytics()
}

// After a successful increment has reconciled the authoritative snapshot:
if (this.#state.statsOpen) void this.loadAnalytics().catch(() => {})

async loadAnalytics(window = this.#state.analyticsWindow): Promise<void> {
  if (!this.#state.statsEnabled) return
  const request = ++this.#analyticsRequest
  this.#update({ analyticsWindow: window, analyticsLoading: true, analyticsError: null })
  try {
    const analytics = await this.#transport.getAnalytics(this.#key, window)
    if (request === this.#analyticsRequest) this.#update({ analytics, analyticsLoading: false })
  } catch (caught) {
    if (request === this.#analyticsRequest) this.#update({ analyticsLoading: false, analyticsError: asError(caught) })
    throw caught
  }
}
```

Keep the post-increment refresh detached so a failed refresh cannot reject a successfully recorded event.

- [ ] **Step 4: Run green tests**

Run: `npm test --workspace @waves-counter/client -- controller.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/controller.ts packages/client/test/controller.test.ts
git commit -m "fix(client): refresh analytics after events"
```

### Task 2: Add Number Flow and non-blocking refresh UI to React

**Files:**
- Modify: `packages/react/package.json`, `package-lock.json`
- Modify: `packages/react/src/WaveCounter.tsx:1-20,384-405`
- Modify: `packages/react/test/WaveCounter.test.tsx:117-137`

**Interfaces:**
- Consumes: `wave.analytics`, `wave.analyticsLoading`, `@number-flow/react`.
- Produces: a default popover that keeps summary/chart visible while refreshing and rolls the total between windows.

- [ ] **Step 1: Write the failing UI regression test**

```tsx
test('retains analytics while the selected window refreshes', async () => {
  let resolveWindow!: (value: Analytics) => void
  const getAnalytics = vi.fn().mockResolvedValueOnce(analytics)
    .mockReturnValueOnce(new Promise<Analytics>((resolve) => { resolveWindow = resolve }))
  renderCounter(transport({ getAnalytics }))
  fireEvent.contextMenu(await screen.findByRole('button'))
  expect(await screen.findByTestId('accessible-summary')).toHaveTextContent('6 events')
  fireEvent.click(screen.getByRole('button', { name: '1M' }))
  expect(screen.getByTestId('accessible-summary')).toHaveTextContent('6 events')
  expect(screen.getByText('Refreshing activity')).not.toBeNull()
  await act(() => resolveWindow(analyticsFor('all')))
})
```

- [ ] **Step 2: Run the red test**

Run: `npm test --workspace @waves-counter/react -- WaveCounter.test.tsx`

Expected: FAIL because the current loading branch replaces cached analytics.

- [ ] **Step 3: Install and render the React adapter**

Run: `npm install --workspace @waves-counter/react @number-flow/react`

Add `import NumberFlow from '@number-flow/react'`. Replace the default `{wave.analytics.total}` summary value with `<NumberFlow value={wave.analytics.total} />`. Change the blocking condition to `wave.analyticsLoading && !wave.analytics`; inside the existing analytics branch, add `<div role="status" className="wave-counter__sr-only">Refreshing activity</div>` when `wave.analyticsLoading` is true.

- [ ] **Step 4: Verify React**

Run: `npm test --workspace @waves-counter/react -- WaveCounter.test.tsx && npm run typecheck --workspace @waves-counter/react`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/react/package.json package-lock.json packages/react/src/WaveCounter.tsx packages/react/test/WaveCounter.test.tsx
git commit -m "feat(react): animate refreshed analytics totals"
```

### Task 3: Add Number Flow and non-blocking refresh UI to Vue

**Files:**
- Modify: `packages/vue/package.json`, `package-lock.json`
- Modify: `packages/vue/src/WaveCounter.vue:1-30,280-330`
- Modify: `packages/vue/test/WaveCounter.test.ts:129-151`

**Interfaces:**
- Consumes: `wave.analytics`, `wave.analyticsLoading`, `@number-flow/vue`.
- Produces: a default popover that keeps summary/chart visible while refreshing and rolls the total between windows.

- [ ] **Step 1: Write the failing UI regression test**

```ts
test('retains analytics while the selected window refreshes', async () => {
  let resolveWindow!: (value: Analytics) => void
  const getAnalytics = vi.fn().mockResolvedValueOnce(analytics)
    .mockReturnValueOnce(new Promise<Analytics>((resolve) => { resolveWindow = resolve }))
  const wrapper = mountCounter(transport({ getAnalytics }))
  await flushPromises()
  await wrapper.get('button').trigger('contextmenu')
  await flushPromises()
  await wrapper.get('button[aria-label="1M"]').trigger('click')
  expect(wrapper.get('[data-accessible-summary]').text()).toContain('6 events')
  expect(wrapper.get('[role="status"]').text()).toContain('Refreshing activity')
  resolveWindow(analyticsFor('all'))
  await flushPromises()
})
```

- [ ] **Step 2: Run the red test**

Run: `npm test --workspace @waves-counter/vue -- WaveCounter.test.ts`

Expected: FAIL because `v-if="wave.analyticsLoading.value"` replaces cached analytics.

- [ ] **Step 3: Install and render the Vue adapter**

Run: `npm install --workspace @waves-counter/vue @number-flow/vue`

Add `import NumberFlow from '@number-flow/vue'`. Change the initial loader to `v-if="wave.analyticsLoading.value && !wave.analytics.value"`; replace the default total with `<NumberFlow :value="wave.analytics.value.total" />`; and add a screen-reader-only `Refreshing activity` status in the analytics branch when loading.

- [ ] **Step 4: Verify Vue**

Run: `npm test --workspace @waves-counter/vue -- WaveCounter.test.ts && npm run typecheck --workspace @waves-counter/vue`

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/vue/package.json package-lock.json packages/vue/src/WaveCounter.vue packages/vue/test/WaveCounter.test.ts
git commit -m "feat(vue): animate refreshed analytics totals"
```

### Task 4: Verify the integrated packages

**Files:** Modify only if a prior task reveals a test or type error.

- [ ] **Step 1: Run focused package verification**

Run: `npm test --workspace @waves-counter/client && npm test --workspace @waves-counter/react && npm test --workspace @waves-counter/vue && npm run typecheck --workspace @waves-counter/client && npm run typecheck --workspace @waves-counter/react && npm run typecheck --workspace @waves-counter/vue`

Expected: every command exits 0.

- [ ] **Step 2: Run repository checks**

Run: `npm run check`

Expected: all version, conformance, DTO, and package-manifest checks pass.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check HEAD && git status --short`

Expected: no whitespace errors; only the planned source, tests, manifests, lockfile, spec, and plan are changed.

# Stripeish Analytics Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace persistent analytics-chart markers with a smooth 1.7px trend line and a subtle gradient area fill in both framework packages.

**Architecture:** `@waves-counter/client` produces canonical SVG paths from existing chart coordinates. React and Vue consume those paths with equivalent SVG and CSS, while the existing text summary remains the accessible presentation.

**Tech Stack:** TypeScript, SVG, React 19, Vue 3, Vitest.

## Global Constraints

- Accessible analytics text and chart math stay single-sourced in `packages/client/src/analytics.ts`.
- Keep the SVG `aria-hidden="true"`, text summary, baseline, and draw-in motion.
- Use a smooth monotone curve that does not overshoot daily values and has no persistent markers.
- Use a rounded Tidepool line at exactly 1.7px and a vertical Tidepool-to-transparent area fill.
- Do not add dependencies, tooltips, analytics values, or analytics-window logic.

---

## File structure

- `packages/client/src/analytics.ts`: shared smooth line and area path generation.
- `packages/client/src/index.ts`: shared path API exports.
- `packages/client/test/analytics.test.ts`: shared path behavior tests.
- `packages/react/src/AnalyticsChart.tsx` and `packages/vue/src/AnalyticsChart.vue`: equivalent SVG renderers.
- `packages/react/src/styles.css` and `packages/vue/src/styles.css`: equivalent area/line styles.
- Framework `WaveCounter` tests: marker-free DOM regressions.

### Task 1: Create shared smooth SVG paths

**Files:**

- Modify: `packages/client/src/analytics.ts:70-110`
- Modify: `packages/client/src/index.ts:18-26`
- Test: `packages/client/test/analytics.test.ts:97-118`

**Interfaces:**

- Consumes: `readonly AnalyticsChartPoint[]` and `AnalyticsChartGeometry`.
- Produces: `analyticsChartPaths(points, geometry?): AnalyticsChartPaths`, where the return type is `{ line: string; area: string }`.

- [ ] **Step 1: Write the failing test**

```ts
import { analyticsChartPaths } from '../src/index.js'

test('analyticsChartPaths creates a smooth line and baseline-closed area', () => {
  const points = analyticsChartPoints(analyticsWith({ points: pointsFrom([0, 4, 2]) }))
  expect(analyticsChartPaths(points)).toEqual({
    line: expect.stringMatching(/^M 8 80 C /),
    area: expect.stringMatching(/^M 8 80 C .* L 232 80 L 8 80 Z$/),
  })
})

test('analyticsChartPaths handles a single point', () => {
  const [point] = analyticsChartPoints(analyticsWith({ points: pointsFrom([5]) }))
  expect(analyticsChartPaths([point!])).toEqual({ line: 'M 8 8', area: 'M 8 80 L 8 8 L 8 80 Z' })
})
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npm test --workspace @waves-counter/client -- analytics.test.ts`

Expected: FAIL because `analyticsChartPaths` does not exist.

- [ ] **Step 3: Write the minimal implementation**

```ts
export interface AnalyticsChartPaths { line: string; area: string }

export function analyticsChartPaths(
  points: readonly AnalyticsChartPoint[],
  geometry: AnalyticsChartGeometry = ANALYTICS_CHART_GEOMETRY,
): AnalyticsChartPaths {
  if (points.length === 0) return { line: '', area: '' }
  const baseline = geometry.height - geometry.inset
  if (points.length === 1) {
    const point = points[0]!
    return { line: `M ${point.x} ${point.y}`, area: `M ${point.x} ${baseline} L ${point.x} ${point.y} L ${point.x} ${baseline} Z` }
  }
  const line = monotonePath(points)
  const first = points[0]!
  const last = points.at(-1)!
  return { line, area: `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z` }
}
```

Implement private `monotonePath()` with finite differences and Fritsch-Carlson tangent limiting, emitting cubic `C` segments so every curve segment remains within adjacent data extrema. Export the function and type from `packages/client/src/index.ts`.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npm test --workspace @waves-counter/client -- analytics.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the task**

Run: `git add packages/client/src/analytics.ts packages/client/src/index.ts packages/client/test/analytics.test.ts && git commit -m "feat(client): add smooth analytics chart paths"`

### Task 2: Render marker-free gradient charts

**Files:**

- Modify: `packages/react/src/AnalyticsChart.tsx:1-13`
- Modify: `packages/react/src/styles.css:264-302`
- Modify: `packages/react/test/WaveCounter.test.tsx:232-241`
- Modify: `packages/vue/src/AnalyticsChart.vue:1-37`
- Modify: `packages/vue/src/styles.css:264-302`
- Modify: `packages/vue/test/WaveCounter.test.ts:282-292`

**Interfaces:**

- Consumes: `analyticsChartPoints(analytics)` and `analyticsChartPaths(coordinates)`.
- Produces: matching framework SVGs with a gradient definition, `.wave-chart__area`, and `path.wave-chart__line`, with zero `.wave-chart__point` nodes.

- [ ] **Step 1: Write failing React and Vue DOM assertions**

```ts
const chart = screen.getByTestId('analytics-chart')
expect(chart.querySelector('.wave-chart__area')).not.toBeNull()
expect(chart.querySelector('.wave-chart__line')?.tagName).toBe('path')
expect(chart.querySelectorAll('.wave-chart__point')).toHaveLength(0)
```

```ts
const chart = wrapper.get('.wave-chart')
expect(chart.find('.wave-chart__area').exists()).toBe(true)
expect(chart.find('.wave-chart__line').element.tagName).toBe('path')
expect(chart.findAll('.wave-chart__point')).toHaveLength(0)
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test --workspace @waves-counter/react -- WaveCounter.test.tsx && npm test --workspace @waves-counter/vue -- WaveCounter.test.ts`

Expected: FAIL because both components still render a `polyline` and circles.

- [ ] **Step 3: Implement matching SVGs and styles**

Use `analyticsChartPaths(coordinates)`, render a local `<linearGradient>` with Tidepool opacity `0.22` at the top and `0` at the bottom, then render:

```tsx
<path className="wave-chart__area" d={paths.area} />
<line className="wave-chart__baseline" x1="8" y1="80" x2="232" y2="80" />
<path className="wave-chart__line" d={paths.line} pathLength="1" />
```

Use Vue bindings for the equivalent nodes. Delete marker markup and `.wave-chart__point` CSS. Add `.wave-chart__area { fill: url(#wave-chart-gradient); }`, change `.wave-chart__line` to `stroke-width: 1.7`, and add the area to the existing reduced-transparency fallback.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test --workspace @waves-counter/react -- WaveCounter.test.tsx && npm test --workspace @waves-counter/vue -- WaveCounter.test.ts`

Expected: PASS with zero failures.

- [ ] **Step 5: Commit the task**

Run: `git add packages/react/src/AnalyticsChart.tsx packages/react/src/styles.css packages/react/test/WaveCounter.test.tsx packages/vue/src/AnalyticsChart.vue packages/vue/src/styles.css packages/vue/test/WaveCounter.test.ts && git commit -m "feat: refine analytics charts"`

### Task 3: Verify final scope

**Files:** Verify only the files changed in Tasks 1 and 2.

- [ ] **Step 1: Run package suites**

Run: `npm test --workspace @waves-counter/client && npm test --workspace @waves-counter/react && npm test --workspace @waves-counter/vue`

Expected: PASS with zero failures.

- [ ] **Step 2: Run repository checks**

Run: `npm run check`

Expected: exit code 0 with no drift.

- [ ] **Step 3: Inspect diff quality**

Run: `git diff --check && git diff --stat`

Expected: no whitespace errors and only the planned chart and documentation changes.

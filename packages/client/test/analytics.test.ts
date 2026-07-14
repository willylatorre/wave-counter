import { expect, test } from 'vitest'

import {
  ANALYTICS_CHART_GEOMETRY,
  analyticsChartPoints,
  capitalize,
  comparisonText,
  defaultRangeText,
  rangeText,
  summaryText,
  windowSummary,
  type Analytics,
  type AnalyticsWindow,
} from '../src/index.js'

function analyticsWith(overrides: Partial<Analytics> = {}): Analytics {
  return {
    key: 'coffee',
    window: '7d',
    interval: 'day',
    timezone: 'UTC',
    total: 0,
    previousTotal: 0,
    changePercentage: null,
    points: [],
    ...overrides,
  }
}

function pointsFrom(counts: number[]): Analytics['points'] {
  return counts.map((count, index) => ({
    start: `2026-07-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
    count,
  }))
}

test('capitalize upper-cases only the first character', () => {
  expect(capitalize('coffee')).toBe('Coffee')
  expect(capitalize('')).toBe('')
})

test('comparisonText handles a null analytics snapshot', () => {
  expect(comparisonText(null, '7d')).toBe('')
})

test('comparisonText reports all-time totals without a previous period', () => {
  expect(comparisonText(analyticsWith({ window: 'all', total: 0 }), 'all')).toBe('No all-time events')
  expect(comparisonText(analyticsWith({ window: 'all', total: 9 }), 'all')).toBe('9 all-time events')
})

test('comparisonText names the previous period per window', () => {
  expect(comparisonText(analyticsWith({ total: 0, previousTotal: 0 }), '7d')).toBe(
    'No events in this or the previous seven days',
  )
  expect(comparisonText(analyticsWith({ total: 3, previousTotal: 0 }), '1M')).toBe(
    '3 events, with none in the previous 30 days',
  )
})

test('comparisonText renders signed percentage change', () => {
  expect(comparisonText(analyticsWith({ total: 12, previousTotal: 10, changePercentage: 20 }), '7d')).toBe(
    '20% more than the previous seven days',
  )
  expect(
    comparisonText(analyticsWith({ window: '1M', total: 8, previousTotal: 10, changePercentage: -20 }), '1M'),
  ).toBe('20% less than the previous 30 days')
})

test('rangeText spans the first and last UTC point, or falls back per window', () => {
  const analytics = analyticsWith({ points: pointsFrom([1, 2, 3]) })
  expect(rangeText(analytics, '7d')).toBe('Jul 1 to Jul 3, UTC')
  expect(rangeText(analyticsWith({ points: [] }), '1M')).toBe('Last 30 UTC days')
  expect(rangeText(null, 'all')).toBe('All-time UTC activity')
})

test('defaultRangeText and windowSummary vary by window', () => {
  const windows: AnalyticsWindow[] = ['7d', '1M', 'all']
  expect(windows.map((window) => defaultRangeText(window))).toEqual([
    'Last seven UTC days',
    'Last 30 UTC days',
    'All-time UTC activity',
  ])
  expect(windows.map((window) => windowSummary(window))).toEqual([
    'the last seven days',
    'the last 30 days',
    'all time',
  ])
})

test('summaryText duplicates total, daily counts, and comparison', () => {
  const analytics = analyticsWith({ total: 6, previousTotal: 0, points: pointsFrom([1, 2, 3]) })
  expect(summaryText(analytics, '7d')).toBe(
    '6 events in the last seven days. Daily counts: 1, 2, 3. 6 events, with none in the previous seven days.',
  )
})

test('analyticsChartPoints maps counts into the viewBox, flooring the max at 1', () => {
  const { width, height, inset } = ANALYTICS_CHART_GEOMETRY
  const flat = analyticsChartPoints(analyticsWith({ points: pointsFrom([0, 0, 0]) }))
  // A flat zero series sits on the baseline (max floored at 1 avoids /0).
  expect(flat.every((point) => point.y === height - inset)).toBe(true)
  expect(flat[0]?.x).toBe(inset)
  expect(flat.at(-1)?.x).toBe(width - inset)

  const peak = analyticsChartPoints(analyticsWith({ points: pointsFrom([0, 4, 2]) }))
  // The tallest count reaches the top inset; a zero count stays on the baseline.
  expect(peak[1]?.y).toBe(inset)
  expect(peak[0]?.y).toBe(height - inset)
})

test('analyticsChartPoints handles a single point without dividing by zero', () => {
  const [only] = analyticsChartPoints(analyticsWith({ points: pointsFrom([5]) }))
  expect(only).toEqual({ x: ANALYTICS_CHART_GEOMETRY.inset, y: ANALYTICS_CHART_GEOMETRY.inset, count: 5 })
})

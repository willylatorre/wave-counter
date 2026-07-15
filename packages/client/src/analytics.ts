import type { Analytics, AnalyticsWindow } from './types.js'

/**
 * Framework-neutral presentation helpers for an {@link Analytics} snapshot.
 *
 * These carry the accessible text (comparison, range, summary) that PRODUCT.md
 * requires to be identical across every framework binding, and the chart
 * coordinate math the SVG line uses. They live here — the shared brain — so
 * React and Vue render one tested copy instead of maintaining parallel prose.
 */

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

/**
 * Human-facing comparison sentence for the current window versus its previous
 * period. `all` has no previous period, so it reports a bare total.
 */
export function comparisonText(analytics: Analytics | null, window: AnalyticsWindow): string {
  if (!analytics) return ''
  if (window === 'all') {
    return analytics.total === 0 ? 'No all-time events' : `${analytics.total} all-time events`
  }
  const previousPeriod = window === '1M' ? 'previous 30 days' : 'previous seven days'
  if (analytics.previousTotal === 0) {
    return analytics.total === 0
      ? `No events in this or the ${previousPeriod}`
      : `${analytics.total} events, with none in the ${previousPeriod}`
  }
  const change = analytics.changePercentage ?? 0
  const direction = change >= 0 ? 'more' : 'less'
  return `${Math.abs(change)}% ${direction} than the ${previousPeriod}`
}

/** UTC date range spanned by the analytics points, or a window-specific default. */
export function rangeText(analytics: Analytics | null, window: AnalyticsWindow): string {
  if (!analytics?.points.length) return defaultRangeText(window)
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
  const first = analytics.points[0]
  const last = analytics.points.at(-1)
  return first && last
    ? `${formatter.format(new Date(first.start))} to ${formatter.format(new Date(last.start))}, UTC`
    : defaultRangeText(window)
}

/** Screen-reader summary duplicating the chart's total, daily counts, and comparison. */
export function summaryText(analytics: Analytics | null, window: AnalyticsWindow): string {
  if (!analytics) return ''
  const dailyCounts = analytics.points.map((point) => point.count).join(', ')
  return `${analytics.total} events in ${windowSummary(window)}. Daily counts: ${dailyCounts}. ${comparisonText(analytics, window)}.`
}

export function defaultRangeText(window: AnalyticsWindow): string {
  if (window === '1M') return 'Last 30 UTC days'
  if (window === 'all') return 'All-time UTC activity'
  return 'Last seven UTC days'
}

export function windowSummary(window: AnalyticsWindow): string {
  if (window === '1M') return 'the last 30 days'
  if (window === 'all') return 'all time'
  return 'the last seven days'
}

/** A single plotted point in the analytics chart's viewBox coordinate space. */
export interface AnalyticsChartPoint {
  x: number
  y: number
  count: number
}

/** Geometry of the analytics chart's fixed SVG viewBox. */
export interface AnalyticsChartGeometry {
  width: number
  height: number
  inset: number
}

export const ANALYTICS_CHART_GEOMETRY: AnalyticsChartGeometry = {
  width: 240,
  height: 88,
  inset: 8,
}

/**
 * Maps analytics points to coordinates inside {@link ANALYTICS_CHART_GEOMETRY}'s
 * viewBox. The y-axis is normalized against the largest count (floored at 1 so a
 * flat zero series still draws on the baseline).
 */
export function analyticsChartPoints(
  analytics: Analytics,
  geometry: AnalyticsChartGeometry = ANALYTICS_CHART_GEOMETRY,
): AnalyticsChartPoint[] {
  const { width, height, inset } = geometry
  const points = analytics.points
  const maximum = Math.max(1, ...points.map((point) => point.count))
  return points.map((point, index) => ({
    x: inset + (index / Math.max(1, points.length - 1)) * (width - inset * 2),
    y: height - inset - (point.count / maximum) * (height - inset * 2),
    count: point.count,
  }))
}

/** SVG paths for the marker-free analytics trend line and its baseline-closed area. */
export interface AnalyticsChartPaths {
  line: string
  area: string
}

/**
 * Converts chart coordinates into a smooth, monotone cubic trend line. Each
 * segment's controls share the midpoint x-coordinate, keeping the curve within
 * the daily values at either end rather than overshooting them.
 */
export function analyticsChartPaths(
  points: readonly AnalyticsChartPoint[],
  geometry: AnalyticsChartGeometry = ANALYTICS_CHART_GEOMETRY,
): AnalyticsChartPaths {
  if (points.length === 0) return { line: '', area: '' }

  const baseline = geometry.height - geometry.inset
  const first = points[0]!
  if (points.length === 1) {
    return {
      line: `M ${first.x} ${first.y}`,
      area: `M ${first.x} ${baseline} L ${first.x} ${first.y} L ${first.x} ${baseline} Z`,
    }
  }

  let line = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!
    const point = points[index]!
    const midpoint = (previous.x + point.x) / 2
    line += ` C ${midpoint} ${previous.y} ${midpoint} ${point.y} ${point.x} ${point.y}`
  }

  const last = points.at(-1)!
  return {
    line,
    area: `${line} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`,
  }
}

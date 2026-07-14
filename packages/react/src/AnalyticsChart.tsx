import type { Analytics } from '@waves-counter/client'

export interface AnalyticsChartProps { analytics: Analytics; animate?: boolean }

export function AnalyticsChart({ analytics, animate = true }: AnalyticsChartProps): React.JSX.Element {
  const width = 240
  const height = 88
  const inset = 8
  const maximum = Math.max(1, ...analytics.points.map((point) => point.count))
  const coordinates = analytics.points.map((point, index, points) => ({
    x: inset + (index / Math.max(1, points.length - 1)) * (width - inset * 2),
    y: height - inset - (point.count / maximum) * (height - inset * 2),
  }))
  return (
    <svg className="wave-chart" data-testid="analytics-chart" data-animate={animate || undefined} viewBox="0 0 240 88" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line className="wave-chart__baseline" x1="8" y1="80" x2="232" y2="80" />
      <polyline className="wave-chart__line" points={coordinates.map(({ x, y }) => `${x},${y}`).join(' ')} pathLength="1" />
      {coordinates.map(({ x, y }) => <circle key={`${x}-${y}`} className="wave-chart__point" cx={x} cy={y} r="2.5" />)}
    </svg>
  )
}

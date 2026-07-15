import { analyticsChartPaths, analyticsChartPoints, type Analytics } from '@waves-counter/client'

export interface AnalyticsChartProps { analytics: Analytics; animate?: boolean }

export function AnalyticsChart({ analytics, animate = true }: AnalyticsChartProps): React.JSX.Element {
  const coordinates = analyticsChartPoints(analytics)
  const paths = analyticsChartPaths(coordinates)
  return (
    <svg className="wave-chart" data-testid="analytics-chart" data-animate={animate || undefined} viewBox="0 0 240 88" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="wave-chart-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--wave-accent)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--wave-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="wave-chart__area" d={paths.area} />
      <line className="wave-chart__baseline" x1="8" y1="80" x2="232" y2="80" />
      <path className="wave-chart__line" d={paths.line} pathLength="1" />
    </svg>
  )
}

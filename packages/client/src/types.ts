export interface CounterSnapshot {
  key: string
  total: number
  updatedAt: string | null
}

export interface AnalyticsPoint {
  start: string
  count: number
}

export type AnalyticsWindow = '7d' | '1M' | 'all'

export interface Analytics {
  key: string
  window: AnalyticsWindow
  interval: 'day'
  timezone: 'UTC'
  total: number
  previousTotal: number
  changePercentage: number | null
  points: AnalyticsPoint[]
}

export interface WaveCounterTransport {
  getCounter(key: string): Promise<CounterSnapshot>
  increment(key: string): Promise<CounterSnapshot>
  getAnalytics(key: string, window?: AnalyticsWindow): Promise<Analytics>
}

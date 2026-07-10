export interface CounterSnapshot {
  key: string
  total: number
  updatedAt: string | null
}

export interface AnalyticsPoint {
  start: string
  count: number
}

export interface Analytics {
  key: string
  window: '7d'
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
  getAnalytics(key: string): Promise<Analytics>
}


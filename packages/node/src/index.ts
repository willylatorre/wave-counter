import { NativeWaveCounter } from './native.js'

export interface CounterSnapshot {
  key: string
  total: number
  updatedAt: string | null
}

export interface RecordEventResult {
  counter: CounterSnapshot
  created: boolean
}

export interface AnalyticsPoint {
  start: string
  count: number
}

export interface Analytics {
  key: string
  window: string
  interval: string
  timezone: string
  total: number
  previousTotal: number
  changePercentage: number | null
  points: AnalyticsPoint[]
}

export interface WaveCounterEngine {
  getCounter(key: string): Promise<CounterSnapshot>
  recordEvent(key: string, eventId: string): Promise<RecordEventResult>
  analytics(key: string, window?: string): Promise<Analytics>
}

export interface WaveCounterOptions {
  databasePath?: string
  initialCounts?: Record<string, number>
  busyTimeoutMs?: number
}

export class WaveCounterError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'WaveCounterError'
    this.code = code
  }
}

export class WaveCounter implements WaveCounterEngine {
  readonly #native: InstanceType<typeof NativeWaveCounter>

  constructor(options: WaveCounterOptions = {}) {
    try {
      this.#native = new NativeWaveCounter(
        options.databasePath,
        options.initialCounts ? JSON.stringify(options.initialCounts) : undefined,
        options.busyTimeoutMs,
      )
    } catch (error) {
      throw domainError(error)
    }
  }

  async getCounter(key: string): Promise<CounterSnapshot> {
    return this.#call<CounterSnapshot>(() => this.#native.getCounter(key))
  }

  async recordEvent(key: string, eventId: string): Promise<RecordEventResult> {
    return this.#call<RecordEventResult>(() => this.#native.recordEvent(key, eventId))
  }

  async analytics(key: string, window = '7d'): Promise<Analytics> {
    return this.#call<Analytics>(() => this.#native.analytics(key, window))
  }

  close(): void {
    this.#native.close()
  }

  async #call<Result>(operation: () => Promise<string>): Promise<Result> {
    try {
      return JSON.parse(await operation()) as Result
    } catch (error) {
      throw domainError(error)
    }
  }
}

function domainError(error: unknown): WaveCounterError {
  const message = error instanceof Error ? error.message : String(error)
  const separator = message.indexOf('|')
  if (separator === -1) return new WaveCounterError('storage', 'storage operation failed')
  return new WaveCounterError(message.slice(0, separator), message.slice(separator + 1))
}

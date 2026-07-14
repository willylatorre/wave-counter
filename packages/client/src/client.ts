import { v7 as uuidv7 } from 'uuid'

import type { Analytics, AnalyticsWindow, CounterSnapshot, WaveCounterTransport } from './types.js'

export interface WaveCounterClientOptions {
  endpoint: string
  fetch?: typeof globalThis.fetch
  eventId?: () => string
}

interface ErrorBody {
  error?: {
    code?: string
    message?: string
  }
}

export class WaveCounterHttpError extends Error {
  readonly status: number
  readonly code: string
  readonly retryAfter: string | null

  constructor(status: number, code: string, message: string, retryAfter: string | null) {
    super(message)
    this.name = 'WaveCounterHttpError'
    this.status = status
    this.code = code
    this.retryAfter = retryAfter
  }
}

export class WaveCounterClient implements WaveCounterTransport {
  readonly #endpoint: string
  readonly #fetch: typeof globalThis.fetch
  readonly #eventId: () => string

  constructor(options: WaveCounterClientOptions) {
    this.#endpoint = options.endpoint.replace(/\/+$/, '')
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.#eventId = options.eventId ?? uuidv7
  }

  getCounter(key: string): Promise<CounterSnapshot> {
    return this.#request<CounterSnapshot>(`/counters/${encodeURIComponent(key)}`, {
      headers: { accept: 'application/json' },
    })
  }

  recordEvent(key: string, eventId: string): Promise<CounterSnapshot> {
    return this.#request<CounterSnapshot>(`/counters/${encodeURIComponent(key)}/events`, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json' },
      body: JSON.stringify({ eventId }),
    })
  }

  async increment(key: string): Promise<CounterSnapshot> {
    const eventId = this.#eventId()
    try {
      return await this.recordEvent(key, eventId)
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
      return this.recordEvent(key, eventId)
    }
  }

  getAnalytics(key: string, window: AnalyticsWindow = '7d'): Promise<Analytics> {
    return this.#request<Analytics>(
      `/counters/${encodeURIComponent(key)}/analytics?window=${encodeURIComponent(window)}`,
      { headers: { accept: 'application/json' } },
    )
  }

  async #request<Result>(path: string, init: RequestInit): Promise<Result> {
    const response = await this.#fetch(`${this.#endpoint}${path}`, init)
    const body = (await response.json()) as Result | ErrorBody
    if (!response.ok) {
      const error = body as ErrorBody
      throw new WaveCounterHttpError(
        response.status,
        error.error?.code ?? 'http_error',
        error.error?.message ?? `Wave Counter request failed with ${response.status}`,
        response.headers.get('retry-after'),
      )
    }
    return body as Result
  }
}

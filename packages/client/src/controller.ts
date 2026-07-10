import type { Analytics, CounterSnapshot, WaveCounterTransport } from './types.js'

export interface WaveCounterState {
  counter: CounterSnapshot | null
  analytics: Analytics | null
  loading: boolean
  pendingIncrements: number
  analyticsLoading: boolean
  statsEnabled: boolean
  statsOpen: boolean
  error: Error | null
  analyticsError: Error | null
}

export interface WaveCounterControllerOptions {
  showStats?: boolean
}

export type WaveCounterListener = (state: Readonly<WaveCounterState>) => void

export class WaveCounterController {
  readonly #key: string
  readonly #transport: WaveCounterTransport
  readonly #listeners = new Set<WaveCounterListener>()
  #authoritative: CounterSnapshot | null = null
  #state: WaveCounterState

  constructor(
    key: string,
    transport: WaveCounterTransport,
    options: WaveCounterControllerOptions = {},
  ) {
    this.#key = key
    this.#transport = transport
    this.#state = {
      counter: null,
      analytics: null,
      loading: false,
      pendingIncrements: 0,
      analyticsLoading: false,
      statsEnabled: options.showStats ?? true,
      statsOpen: false,
      error: null,
      analyticsError: null,
    }
  }

  get snapshot(): Readonly<WaveCounterState> {
    return this.#state
  }

  subscribe(listener: WaveCounterListener): () => void {
    this.#listeners.add(listener)
    listener(this.#state)
    return () => this.#listeners.delete(listener)
  }

  async load(): Promise<void> {
    this.#update({ loading: true, error: null })
    try {
      const counter = await this.#transport.getCounter(this.#key)
      this.#authoritative = latestCounter(this.#authoritative, counter)
      this.#syncCounter({ loading: false })
    } catch (caught) {
      this.#update({ loading: false, error: asError(caught) })
      throw caught
    }
  }

  async increment(): Promise<void> {
    this.#syncCounter({
      pendingIncrements: this.#state.pendingIncrements + 1,
      error: null,
    })
    try {
      const counter = await this.#transport.increment(this.#key)
      this.#authoritative = latestCounter(this.#authoritative, counter)
      this.#syncCounter({ pendingIncrements: this.#state.pendingIncrements - 1 })
    } catch (caught) {
      this.#syncCounter({
        pendingIncrements: this.#state.pendingIncrements - 1,
        error: asError(caught),
      })
      throw caught
    }
  }

  enableStats(enabled: boolean): void {
    this.#update({ statsEnabled: enabled, statsOpen: enabled ? this.#state.statsOpen : false })
  }

  async openStats(): Promise<void> {
    if (!this.#state.statsEnabled) return
    this.#update({ statsOpen: true })
    if (this.#state.analytics === null) await this.loadAnalytics()
  }

  closeStats(): void {
    this.#update({ statsOpen: false })
  }

  async toggleStats(): Promise<void> {
    if (this.#state.statsOpen) this.closeStats()
    else await this.openStats()
  }

  async loadAnalytics(): Promise<void> {
    if (!this.#state.statsEnabled) return
    this.#update({ analyticsLoading: true, analyticsError: null })
    try {
      const analytics = await this.#transport.getAnalytics(this.#key)
      this.#update({ analytics, analyticsLoading: false })
    } catch (caught) {
      this.#update({ analyticsLoading: false, analyticsError: asError(caught) })
      throw caught
    }
  }

  #syncCounter(update: Partial<WaveCounterState> = {}): void {
    const base = this.#authoritative ?? { key: this.#key, total: 0, updatedAt: null }
    const pendingIncrements = update.pendingIncrements ?? this.#state.pendingIncrements
    this.#update({
      counter: { ...base, total: base.total + pendingIncrements },
      ...update,
    })
  }

  #update(update: Partial<WaveCounterState>): void {
    this.#state = { ...this.#state, ...update }
    for (const listener of this.#listeners) listener(this.#state)
  }
}

function latestCounter(
  current: CounterSnapshot | null,
  incoming: CounterSnapshot,
): CounterSnapshot {
  if (current === null || incoming.total >= current.total) return incoming
  return current
}

function asError(caught: unknown): Error {
  return caught instanceof Error ? caught : new Error(String(caught))
}

import {
  computed,
  getCurrentScope,
  onScopeDispose,
  shallowRef,
  type ComputedRef,
  type ShallowRef,
} from 'vue'

import {
  WaveCounterClient,
  WaveCounterController,
  type Analytics,
  type AnalyticsWindow,
  type CounterSnapshot,
  type WaveCounterState,
  type WaveCounterTransport,
} from '@waves-counter/client'

export interface UseWaveCounterOptions {
  counterKey: string
  endpoint?: string
  showStats?: boolean
  analyticsWindow?: AnalyticsWindow
  transport?: WaveCounterTransport
}

export interface UseWaveCounterResult {
  state: ShallowRef<Readonly<WaveCounterState>>
  counter: ComputedRef<CounterSnapshot | null>
  analytics: ComputedRef<Analytics | null>
  analyticsWindow: ComputedRef<AnalyticsWindow>
  loading: ComputedRef<boolean>
  pendingIncrements: ComputedRef<number>
  analyticsLoading: ComputedRef<boolean>
  statsEnabled: ComputedRef<boolean>
  statsOpen: ComputedRef<boolean>
  error: ComputedRef<Error | null>
  analyticsError: ComputedRef<Error | null>
  load: () => Promise<void>
  increment: () => Promise<void>
  enableStats: (enabled: boolean) => void
  openStats: () => Promise<void>
  closeStats: () => void
  toggleStats: () => Promise<void>
  setAnalyticsWindow: (window: AnalyticsWindow) => Promise<void>
  loadAnalytics: (window?: AnalyticsWindow) => Promise<void>
}

export function useWaveCounter(options: UseWaveCounterOptions): UseWaveCounterResult {
  const transport =
    options.transport ??
    new WaveCounterClient({ endpoint: options.endpoint ?? '/api/waves' })
  const controller = new WaveCounterController(
    options.counterKey,
    transport,
    {
      ...(options.showStats === undefined ? {} : { showStats: options.showStats }),
      ...(options.analyticsWindow === undefined ? {} : { analyticsWindow: options.analyticsWindow }),
    },
  )
  const state = shallowRef<Readonly<WaveCounterState>>(controller.snapshot)
  const unsubscribe = controller.subscribe((snapshot) => {
    state.value = snapshot
  })
  if (getCurrentScope()) onScopeDispose(unsubscribe)

  return {
    state,
    counter: computed(() => state.value.counter),
    analytics: computed(() => state.value.analytics),
    analyticsWindow: computed(() => state.value.analyticsWindow),
    loading: computed(() => state.value.loading),
    pendingIncrements: computed(() => state.value.pendingIncrements),
    analyticsLoading: computed(() => state.value.analyticsLoading),
    statsEnabled: computed(() => state.value.statsEnabled),
    statsOpen: computed(() => state.value.statsOpen),
    error: computed(() => state.value.error),
    analyticsError: computed(() => state.value.analyticsError),
    load: () => controller.load(),
    increment: () => controller.increment(),
    enableStats: (enabled) => controller.enableStats(enabled),
    openStats: () => controller.openStats(),
    closeStats: () => controller.closeStats(),
    toggleStats: () => controller.toggleStats(),
    setAnalyticsWindow: (window) => controller.setAnalyticsWindow(window),
    loadAnalytics: (window) => controller.loadAnalytics(window),
  }
}

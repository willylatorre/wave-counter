import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'

import {
  WaveCounterClient,
  WaveCounterController,
  type AnalyticsWindow,
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

export interface UseWaveCounterResult extends Readonly<WaveCounterState> {
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
  const controller = useMemo(
    () =>
      new WaveCounterController(
        options.counterKey,
        options.transport ?? new WaveCounterClient({ endpoint: options.endpoint ?? '/api/waves' }),
        {
          ...(options.showStats === undefined ? {} : { showStats: options.showStats }),
          ...(options.analyticsWindow === undefined ? {} : { analyticsWindow: options.analyticsWindow }),
        },
      ),
    [options.analyticsWindow, options.counterKey, options.endpoint, options.transport],
  )
  useEffect(() => {
    controller.enableStats(options.showStats ?? true)
  }, [controller, options.showStats])
  const subscribe = useCallback((listener: () => void) => controller.subscribe(listener), [controller])
  const getSnapshot = useCallback(() => controller.snapshot, [controller])
  const getServerSnapshot = useCallback(() => controller.snapshot, [controller])
  const state = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )

  return {
    ...state,
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

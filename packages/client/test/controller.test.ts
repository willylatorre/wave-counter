import { expect, test, vi } from 'vitest'

import {
  WaveCounterController,
  type Analytics,
  type AnalyticsWindow,
  type CounterSnapshot,
  type WaveCounterTransport,
} from '../src/index.js'

const zero: CounterSnapshot = { key: 'coffee', total: 0, updatedAt: null }
const analytics: Analytics = {
  key: 'coffee',
  window: '7d',
  interval: 'day',
  timezone: 'UTC',
  total: 1,
  previousTotal: 0,
  changePercentage: null,
  points: [],
}

function analyticsFor(window: AnalyticsWindow): Analytics {
  return {
    ...analytics,
    window,
    total: window === 'all' ? 9 : analytics.total,
    previousTotal: window === 'all' ? 0 : analytics.previousTotal,
    changePercentage: window === 'all' ? null : analytics.changePercentage,
  }
}

function transport(overrides: Partial<WaveCounterTransport> = {}): WaveCounterTransport {
  return {
    getCounter: vi.fn().mockResolvedValue(zero),
    increment: vi.fn().mockResolvedValue({ ...zero, total: 1 }),
    getAnalytics: vi.fn().mockResolvedValue(analytics),
    ...overrides,
  }
}

test('loads the authoritative counter and notifies subscribers', async () => {
  const controller = new WaveCounterController('coffee', transport())
  const listener = vi.fn()
  const unsubscribe = controller.subscribe(listener)

  await controller.load()
  unsubscribe()

  expect(listener).toHaveBeenCalled()
  expect(controller.snapshot).toMatchObject({ loading: false, counter: zero, error: null })
})

test('does not let a stale initial load overwrite a completed increment', async () => {
  let resolveLoad!: (counter: CounterSnapshot) => void
  const pendingLoad = new Promise<CounterSnapshot>((resolve) => {
    resolveLoad = resolve
  })
  const controller = new WaveCounterController(
    'coffee',
    transport({
      getCounter: vi.fn().mockReturnValue(pendingLoad),
      increment: vi.fn().mockResolvedValue({
        ...zero,
        total: 8,
        updatedAt: '2026-07-10T13:42:00Z',
      }),
    }),
  )

  const load = controller.load()
  await controller.increment()
  resolveLoad({ ...zero, total: 7, updatedAt: '2026-07-10T13:41:00Z' })
  await load

  expect(controller.snapshot.counter?.total).toBe(8)
})

test('does not mutate snapshots retained by subscribers', async () => {
  let resolveIncrement!: (counter: CounterSnapshot) => void
  const pending = new Promise<CounterSnapshot>((resolve) => {
    resolveIncrement = resolve
  })
  const controller = new WaveCounterController(
    'coffee',
    transport({ increment: vi.fn().mockReturnValue(pending) }),
  )
  await controller.load()
  const beforeIncrement = controller.snapshot

  const increment = controller.increment()

  expect(beforeIncrement.pendingIncrements).toBe(0)
  resolveIncrement({ ...zero, total: 1 })
  await increment
})

test('increments optimistically then reconciles to the authoritative total', async () => {
  let resolveIncrement!: (counter: CounterSnapshot) => void
  const pending = new Promise<CounterSnapshot>((resolve) => {
    resolveIncrement = resolve
  })
  const controller = new WaveCounterController(
    'coffee',
    transport({ increment: vi.fn().mockReturnValue(pending) }),
  )
  await controller.load()

  const increment = controller.increment()
  expect(controller.snapshot.counter?.total).toBe(1)
  resolveIncrement({ ...zero, total: 7, updatedAt: '2026-07-10T13:42:00Z' })
  await increment

  expect(controller.snapshot).toMatchObject({
    counter: { total: 7 },
    pendingIncrements: 0,
    error: null,
  })
})

test('rolls back only the failed optimistic increment', async () => {
  const controller = new WaveCounterController(
    'coffee',
    transport({ increment: vi.fn().mockRejectedValue(new Error('offline')) }),
  )
  await controller.load()

  await expect(controller.increment()).rejects.toThrow('offline')

  expect(controller.snapshot).toMatchObject({
    counter: { total: 0 },
    pendingIncrements: 0,
    error: new Error('offline'),
  })
})

test('controls stats at runtime and never loads while disabled', async () => {
  const counterTransport = transport()
  const controller = new WaveCounterController('coffee', counterTransport, { showStats: false })

  await controller.openStats()
  expect(controller.snapshot.statsOpen).toBe(false)
  expect(counterTransport.getAnalytics).not.toHaveBeenCalled()

  controller.enableStats(true)
  await controller.toggleStats()
  expect(controller.snapshot).toMatchObject({ statsEnabled: true, statsOpen: true, analytics })

  controller.enableStats(false)
  expect(controller.snapshot).toMatchObject({ statsEnabled: false, statsOpen: false })
})

test('loads and switches analytics windows', async () => {
  const getAnalytics = vi
    .fn()
    .mockImplementation((_key: string, window: AnalyticsWindow = '7d') =>
      Promise.resolve(analyticsFor(window)),
    )
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))

  await controller.openStats()
  expect(getAnalytics).toHaveBeenLastCalledWith('coffee', '7d')
  expect(controller.snapshot).toMatchObject({ analyticsWindow: '7d', analytics: analyticsFor('7d') })

  await controller.setAnalyticsWindow('all')
  expect(getAnalytics).toHaveBeenLastCalledWith('coffee', 'all')
  expect(controller.snapshot).toMatchObject({ analyticsWindow: 'all', analytics: analyticsFor('all') })
})

test('revalidates cached analytics each time stats opens', async () => {
  const getAnalytics = vi.fn().mockResolvedValue(analytics)
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))

  await controller.openStats()
  controller.closeStats()
  await controller.openStats()

  expect(getAnalytics).toHaveBeenCalledTimes(2)
})

test('refreshes open analytics after a successful increment', async () => {
  const getAnalytics = vi.fn().mockResolvedValue(analytics)
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))

  await controller.openStats()
  await controller.increment()

  expect(getAnalytics).toHaveBeenCalledTimes(2)
})

test('keeps the latest analytics response when refreshes race', async () => {
  let resolveFirst!: (value: Analytics) => void
  let resolveSecond!: (value: Analytics) => void
  const getAnalytics = vi
    .fn()
    .mockReturnValueOnce(new Promise<Analytics>((resolve) => { resolveFirst = resolve }))
    .mockReturnValueOnce(new Promise<Analytics>((resolve) => { resolveSecond = resolve }))
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))

  const first = controller.openStats()
  const second = controller.loadAnalytics()
  resolveSecond(analyticsFor('all'))
  await second
  resolveFirst(analytics)
  await first

  expect(controller.snapshot).toMatchObject({
    analytics: analyticsFor('all'),
    analyticsLoading: false,
  })
})

test('suppresses an obsolete analytics failure after a newer response succeeds', async () => {
  let rejectFirst!: (error: Error) => void
  let resolveSecond!: (value: Analytics) => void
  const getAnalytics = vi
    .fn()
    .mockReturnValueOnce(new Promise<Analytics>((_resolve, reject) => { rejectFirst = reject }))
    .mockReturnValueOnce(new Promise<Analytics>((resolve) => { resolveSecond = resolve }))
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))

  const first = controller.openStats()
  const second = controller.loadAnalytics()
  resolveSecond(analyticsFor('all'))
  await second
  rejectFirst(new Error('obsolete request'))

  await expect(first).resolves.toBeUndefined()
  expect(controller.snapshot).toMatchObject({
    analytics: analyticsFor('all'),
    analyticsError: null,
    analyticsLoading: false,
  })
})

test('keeps analytics errors inside stats and retries', async () => {
  const getAnalytics = vi
    .fn()
    .mockRejectedValueOnce(new Error('analytics offline'))
    .mockResolvedValueOnce(analytics)
  const controller = new WaveCounterController('coffee', transport({ getAnalytics }))

  await expect(controller.openStats()).rejects.toThrow('analytics offline')
  expect(controller.snapshot).toMatchObject({ statsOpen: true, analyticsError: new Error('analytics offline') })

  await controller.loadAnalytics()
  expect(controller.snapshot).toMatchObject({ analytics, analyticsError: null })
})

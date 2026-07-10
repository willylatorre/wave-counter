import { expect, test, vi } from 'vitest'

import {
  WaveCounterController,
  type Analytics,
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

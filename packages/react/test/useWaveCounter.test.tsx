import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { WaveCounterTransport } from '@waves-counter/client'

import { useWaveCounter } from '../src/index.js'

test('exposes controller state and methods', async () => {
  const transport: WaveCounterTransport = {
    getCounter: vi.fn().mockResolvedValue({ key: 'coffee', total: 4, updatedAt: null }),
    increment: vi.fn().mockResolvedValue({ key: 'coffee', total: 5, updatedAt: null }),
    getAnalytics: vi.fn().mockResolvedValue({
      key: 'coffee',
      window: '7d',
      interval: 'day',
      timezone: 'UTC',
      total: 4,
      previousTotal: 2,
      changePercentage: 100,
      points: [],
    }),
  }
  const { result } = renderHook(() => useWaveCounter({ counterKey: 'coffee', transport }))

  await act(() => result.current.load())
  expect(result.current.counter?.total).toBe(4)

  await act(() => result.current.openStats())
  expect(result.current.statsOpen).toBe(true)
  expect(result.current.analytics?.total).toBe(4)
})

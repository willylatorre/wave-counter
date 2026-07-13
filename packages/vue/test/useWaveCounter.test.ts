import { effectScope, nextTick } from 'vue'
import { expect, test, vi } from 'vitest'

import type { Analytics, CounterSnapshot, WaveCounterTransport } from '@waves-counter/client'

import { useWaveCounter } from '../src/index.js'

const counter: CounterSnapshot = { key: 'coffee', total: 4, updatedAt: null }
const analytics: Analytics = {
  key: 'coffee',
  window: '7d',
  interval: 'day',
  timezone: 'UTC',
  total: 4,
  previousTotal: 2,
  changePercentage: 100,
  points: [],
}

function transport(): WaveCounterTransport {
  return {
    getCounter: vi.fn().mockResolvedValue(counter),
    increment: vi.fn().mockResolvedValue({ ...counter, total: 5 }),
    getAnalytics: vi.fn().mockResolvedValue(analytics),
  }
}

test('exposes reactive state and the stats controller', async () => {
  const scope = effectScope()
  const wave = scope.run(() =>
    useWaveCounter({ counterKey: 'coffee', transport: transport(), showStats: true }),
  )
  if (!wave) throw new Error('composable did not initialize')

  await wave.load()
  await nextTick()
  expect(wave.counter.value?.total).toBe(4)

  await wave.openStats()
  expect(wave.statsOpen.value).toBe(true)
  expect(wave.analytics.value).toEqual(analytics)

  wave.enableStats(false)
  expect(wave.statsEnabled.value).toBe(false)
  expect(wave.statsOpen.value).toBe(false)
  scope.stop()
})


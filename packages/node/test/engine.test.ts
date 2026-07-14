import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { WaveCounter, WaveCounterError } from '../src/index.js'

const EVENT_ID = '0198f2f7-6d42-7d94-b1a6-e4305543f132'
const directories: string[] = []

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wave-counter-node-'))
  directories.push(directory)
  return join(directory, 'waves.sqlite3')
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('WaveCounter', () => {
  test('initializes the database eagerly at construction', async () => {
    const path = await databasePath()

    const counter = new WaveCounter({ databasePath: path })

    // Configuration, WAL, and baseline failures surface here, matching the
    // Python binding and the spec's "initialization fails" contract.
    expect(existsSync(path)).toBe(true)
    await expect(counter.getCounter('coffee')).resolves.toMatchObject({ key: 'coffee' })
  })

  test('reads, records, and replays through asynchronous native tasks', async () => {
    const counter = new WaveCounter({
      databasePath: await databasePath(),
      initialCounts: { coffee: 67 },
    })

    const pending = counter.getCounter('coffee')
    expect(pending).toBeInstanceOf(Promise)
    await expect(pending).resolves.toMatchObject({ key: 'coffee', total: 67 })

    await expect(counter.recordEvent('coffee', EVENT_ID)).resolves.toMatchObject({
      created: true,
      counter: { total: 68 },
    })
    await expect(counter.recordEvent('coffee', EVENT_ID)).resolves.toMatchObject({
      created: false,
      counter: { total: 68 },
    })
  })

  test.each([
    ['invalid_counter_key', (counter: WaveCounter) => counter.getCounter('Coffee')],
    [
      'invalid_event_id',
      (counter: WaveCounter) =>
        counter.recordEvent('coffee', '550e8400-e29b-41d4-a716-446655440000'),
    ],
    ['invalid_analytics_window', (counter: WaveCounter) => counter.analytics('coffee', '30d')],
  ])('preserves the %s domain error code', async (code, operation) => {
    const counter = new WaveCounter({ databasePath: await databasePath() })

    await expect(operation(counter)).rejects.toMatchObject<WaveCounterError>({ code })
  })
})

import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import { WaveCounter, WaveCounterError } from '../src/index.js'

const EVENT_ID = '0198f2f7-6d42-7d94-b1a6-e4305543f132'
const directories: string[] = []
const counters: WaveCounter[] = []

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wave-counter-node-'))
  directories.push(directory)
  return join(directory, 'waves.sqlite3')
}

function counter(options: ConstructorParameters<typeof WaveCounter>[0]): WaveCounter {
  const engine = new WaveCounter(options)
  counters.push(engine)
  return engine
}

afterEach(async () => {
  for (const engine of counters.splice(0)) engine.close()
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

describe('WaveCounter', () => {
  test('closes deterministically so temporary databases can be removed', async () => {
    const path = await databasePath()
    const engine = counter({ databasePath: path })

    await expect(engine.getCounter('coffee')).resolves.toMatchObject({ key: 'coffee' })
    expect(existsSync(path)).toBe(true)

    engine.close()
    await expect(rm(path)).resolves.toBeUndefined()
  })

  test('initializes the database eagerly at construction', async () => {
    const path = await databasePath()

    const engine = counter({ databasePath: path })

    // Configuration, WAL, and baseline failures surface here, matching the
    // Python binding and the spec's "initialization fails" contract.
    expect(existsSync(path)).toBe(true)
    await expect(engine.getCounter('coffee')).resolves.toMatchObject({ key: 'coffee' })
  })

  test('reads, records, and replays through asynchronous native tasks', async () => {
    const engine = counter({
      databasePath: await databasePath(),
      initialCounts: { coffee: 67 },
    })

    const pending = engine.getCounter('coffee')
    expect(pending).toBeInstanceOf(Promise)
    await expect(pending).resolves.toMatchObject({ key: 'coffee', total: 67 })

    await expect(engine.recordEvent('coffee', EVENT_ID)).resolves.toMatchObject({
      created: true,
      counter: { total: 68 },
    })
    await expect(engine.recordEvent('coffee', EVENT_ID)).resolves.toMatchObject({
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
    const engine = counter({ databasePath: await databasePath() })

    await expect(operation(engine)).rejects.toMatchObject<WaveCounterError>({ code })
  })
})

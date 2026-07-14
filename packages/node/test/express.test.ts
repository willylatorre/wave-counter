import { readFile } from 'node:fs/promises'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import express from 'express'
import request from 'supertest'
import { afterEach, expect, test } from 'vitest'

import { WaveCounter, WaveCounterError, type WaveCounterEngine } from '../src/index.js'
import { createWaveRouter } from '../src/express.js'

const directories: string[] = []

async function databasePath(name = 'waves.sqlite3'): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'wave-counter-express-'))
  directories.push(directory)
  return join(directory, name)
}

function appFor(counter: WaveCounterEngine, authorize?: (request: express.Request) => boolean) {
  const app = express()
  app.use(express.json())
  app.use('/api/waves', createWaveRouter(counter, { authorize }))
  return app
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})

test('executes the shared conformance scenarios', async () => {
  const fixture = JSON.parse(
    await readFile(new URL('../../../contracts/conformance.json', import.meta.url), 'utf8'),
  )

  for (const [index, scenario] of fixture.scenarios.entries()) {
    const counter = new WaveCounter({
      databasePath: await databasePath(`scenario-${index}.sqlite3`),
      initialCounts: scenario.initialCounts,
    })
    const app = appFor(counter)
    for (const step of scenario.steps) {
      const response = await request(app)
        [step.method.toLowerCase() as 'get' | 'post'](`/api/waves${step.path}`)
        .send(step.json)
      expect(response.status, scenario.name).toBe(step.status)
      if (step.body) expect(response.body, scenario.name).toEqual(step.body)
      else expect(response.body, scenario.name).toMatchObject(step.bodyIncludes)
    }
  }
})

test('records events without host-provided body parsing', async () => {
  const counter = new WaveCounter({ databasePath: await databasePath() })
  const app = express()
  app.use('/api/waves', createWaveRouter(counter))

  const created = await request(app)
    .post('/api/waves/counters/coffee/events')
    .send({ eventId: '0198f2f7-6d42-7d94-b1a6-e4305543f132' })
  const malformed = await request(app)
    .post('/api/waves/counters/coffee/events')
    .set('content-type', 'application/json')
    .send('{')

  expect(created.status).toBe(201)
  expect(created.body.total).toBe(1)
  expect(malformed.status).toBe(400)
  expect(malformed.body).toEqual({
    error: { code: 'invalid_event_id', message: 'event ID must be a UUIDv7' },
  })
})

test('supports host authorization callbacks', async () => {
  const counter = new WaveCounter({ databasePath: await databasePath() })
  const app = appFor(counter, (incoming) => incoming.header('x-key') === 'yes')

  await request(app).get('/api/waves/counters/coffee').expect(403)
  await request(app).get('/api/waves/counters/coffee').set('x-key', 'yes').expect(200)
})

test('maps busy errors and sanitizes internal failures', async () => {
  const failing = (error: WaveCounterError): WaveCounterEngine => ({
    getCounter: async () => Promise.reject(error),
    recordEvent: async () => Promise.reject(error),
    analytics: async () => Promise.reject(error),
  })

  const busy = await request(appFor(failing(new WaveCounterError('busy', 'locked'))))
    .get('/api/waves/counters/coffee')
    .expect(503)
  const internal = await request(appFor(failing(new WaveCounterError('storage', 'secret path'))))
    .get('/api/waves/counters/coffee')
    .expect(500)

  expect(busy.header['retry-after']).toBe('1')
  expect(busy.body).toEqual({
    error: { code: 'busy', message: 'counter storage is temporarily busy' },
  })
  expect(internal.body).toEqual({
    error: { code: 'internal', message: 'internal counter error' },
  })
  expect(internal.text).not.toContain('secret')
})

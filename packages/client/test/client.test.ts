import { describe, expect, test, vi } from 'vitest'

import { WaveCounterClient, WaveCounterHttpError } from '../src/index.js'

const EVENT_ID = '0198f2f7-6d42-7d94-b1a6-e4305543f132'

function response(body: object, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

describe('WaveCounterClient', () => {
  test('encodes counter keys and sends the exact HTTP contract', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(response({ key: 'coffee', total: 0, updatedAt: null }))
      .mockResolvedValueOnce(response({ key: 'coffee', total: 1, updatedAt: 'now' }, 201))
      .mockResolvedValueOnce(
        response({
          key: 'coffee',
          window: '7d',
          interval: 'day',
          timezone: 'UTC',
          total: 1,
          previousTotal: 0,
          changePercentage: null,
          points: [],
        }),
      )
    const client = new WaveCounterClient({ endpoint: '/api/waves/', fetch })

    await client.getCounter('coffee/lab')
    await client.recordEvent('coffee', EVENT_ID)
    await client.getAnalytics('coffee')

    expect(fetch.mock.calls).toEqual([
      ['/api/waves/counters/coffee%2Flab', { headers: { accept: 'application/json' } }],
      [
        '/api/waves/counters/coffee/events',
        {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ eventId: EVENT_ID }),
        },
      ],
      [
        '/api/waves/counters/coffee/analytics?window=7d',
        { headers: { accept: 'application/json' } },
      ],
    ])
  })

  test('retries an ambiguous network failure with the same generated UUIDv7', async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(response({ key: 'coffee', total: 1, updatedAt: 'now' }, 200))
    const eventId = vi.fn(() => EVENT_ID)
    const client = new WaveCounterClient({ endpoint: '/api/waves', fetch, eventId })

    await expect(client.increment('coffee')).resolves.toMatchObject({ total: 1 })

    expect(eventId).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch.mock.calls[0]?.[1]).toEqual(fetch.mock.calls[1]?.[1])
  })

  test('exposes structured HTTP errors and retry hints', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response(
        { error: { code: 'busy', message: 'counter storage is temporarily busy' } },
        503,
        { 'retry-after': '1' },
      ),
    )
    const client = new WaveCounterClient({ endpoint: '/api/waves', fetch })

    const error = await client.getCounter('coffee').catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(WaveCounterHttpError)
    expect(error).toMatchObject({ status: 503, code: 'busy', retryAfter: '1' })
  })

  test('generates a UUIDv7 by default', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(
      response({ key: 'coffee', total: 1, updatedAt: 'now' }, 201),
    )
    const client = new WaveCounterClient({ endpoint: '/api/waves', fetch })

    await client.increment('coffee')

    const body = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body))
    expect(body.eventId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})


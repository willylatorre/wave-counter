import express, {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from 'express'

import { WaveCounterError, type WaveCounterEngine } from './index.js'

export type Authorize = (request: Request) => boolean | Promise<boolean>

export interface WaveRouterOptions {
  authorize?: Authorize
}

export function createWaveRouter(
  counter: WaveCounterEngine,
  options: WaveRouterOptions = {},
): Router {
  const router = Router()
  router.use(parseBody())

  router.get(
    '/counters/:key',
    guarded(options, async (request, response) => {
      response.json(await counter.getCounter(parameter(request.params.key)))
    }),
  )

  router.post(
    '/counters/:key/events',
    guarded(options, async (request, response) => {
      const eventId = typeof request.body?.eventId === 'string' ? request.body.eventId : ''
      const result = await counter.recordEvent(parameter(request.params.key), eventId)
      response.status(result.created ? 201 : 200).json(result.counter)
    }),
  )

  router.get(
    '/counters/:key/analytics',
    guarded(options, async (request, response) => {
      const window = typeof request.query.window === 'string' ? request.query.window : '7d'
      response.json(await counter.analytics(parameter(request.params.key), window))
    }),
  )

  return router
}

function parseBody(): RequestHandler {
  // Parse JSON bodies inside the router so hosts need not mount their own
  // middleware. A malformed body is coerced to empty rather than aborting the
  // request, so the engine produces the authoritative invalid_event_id error,
  // matching the Python adapter's read_event_id.
  const json = express.json()
  return (request, response, next) => {
    json(request, response, (error: unknown) => {
      if (error) request.body = {}
      next()
    })
  }
}

function parameter(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function guarded(
  options: WaveRouterOptions,
  handler: (request: Request, response: Response) => Promise<void | Response>,
): RequestHandler {
  return (request, response) => {
    void (async () => {
      if (!(await allowed(request, options.authorize))) return forbidden(response)
      return handler(request, response)
    })().catch((error: unknown) => errorResponse(response, error))
  }
}

async function allowed(request: Request, authorize?: Authorize): Promise<boolean> {
  return authorize ? authorize(request) : true
}

function forbidden(response: Response): Response {
  return response.status(403).json({
    error: { code: 'forbidden', message: 'counter access denied' },
  })
}

function errorResponse(response: Response, error: unknown): Response {
  if (error instanceof WaveCounterError) {
    if (
      ['invalid_counter_key', 'invalid_event_id', 'invalid_analytics_window'].includes(error.code)
    ) {
      return response.status(400).json({
        error: { code: error.code, message: error.message },
      })
    }
    if (error.code === 'busy') {
      return response.status(503).set('Retry-After', '1').json({
        error: { code: 'busy', message: 'counter storage is temporarily busy' },
      })
    }
  }
  return response.status(500).json({
    error: { code: 'internal', message: 'internal counter error' },
  })
}

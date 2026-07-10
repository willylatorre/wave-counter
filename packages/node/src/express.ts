import { Router, type Request, type RequestHandler, type Response } from 'express'

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

  router.get(
    '/counters/:key',
    route(async (request, response) => {
      if (!(await allowed(request, options.authorize))) return forbidden(response)
      response.json(await counter.getCounter(parameter(request.params.key)))
    }),
  )

  router.post(
    '/counters/:key/events',
    route(async (request, response) => {
      if (!(await allowed(request, options.authorize))) return forbidden(response)
      const eventId = typeof request.body?.eventId === 'string' ? request.body.eventId : ''
      const result = await counter.recordEvent(parameter(request.params.key), eventId)
      response.status(result.created ? 201 : 200).json(result.counter)
    }),
  )

  router.get(
    '/counters/:key/analytics',
    route(async (request, response) => {
      if (!(await allowed(request, options.authorize))) return forbidden(response)
      const window = typeof request.query.window === 'string' ? request.query.window : '7d'
      response.json(await counter.analytics(parameter(request.params.key), window))
    }),
  )

  return router
}

function parameter(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : ''
}

function route(
  handler: (request: Request, response: Response) => Promise<void | Response>,
): RequestHandler {
  return (request, response) => {
    void handler(request, response).catch((error: unknown) => errorResponse(response, error))
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

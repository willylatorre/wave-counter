import express, {
  Router,
  type Request,
  type RequestHandler,
  type Response,
} from 'express'

import { WaveCounterError, type WaveCounterEngine } from './index.js'
import { resolveErrorResponse, resolveForbidden } from './errorContract.js'

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
  const { status, headers, body } = resolveForbidden()
  return send(response, status, headers, body)
}

function errorResponse(response: Response, error: unknown): Response {
  const code = error instanceof WaveCounterError ? error.code : 'internal'
  const message = error instanceof WaveCounterError ? error.message : ''
  const { status, headers, body } = resolveErrorResponse(code, message)
  return send(response, status, headers, body)
}

function send(
  response: Response,
  status: number,
  headers: Record<string, string>,
  body: { code: string; message: string },
): Response {
  return response.status(status).set(headers).json({ error: body })
}

// Declarative HTTP error contract for the Express router. This table is the
// TypeScript projection of contracts/error-responses.json — the single source of
// truth shared with the FastAPI router. errorContract.test.ts asserts the two
// stay identical, so a status/message change here fails until the canonical
// fixture (and therefore every other language) is updated to match.

export interface ErrorEnvelope {
  code: string
  message: string
}

export interface ErrorResponseSpec {
  status: number
  headers?: Record<string, string>
  /** Static envelope. Omitted for domain-message codes, which reuse the engine's own message. */
  body?: ErrorEnvelope
}

/** Codes whose response reuses the originating WaveCounterError's message verbatim. */
export const DOMAIN_MESSAGE_CODES: readonly string[] = [
  'invalid_counter_key',
  'invalid_event_id',
  'invalid_analytics_window',
]

/** Per-code responses. Domain-message codes carry only a status; their body is built from the error. */
export const ERROR_RESPONSES: Record<string, ErrorResponseSpec> = {
  invalid_counter_key: { status: 400 },
  invalid_event_id: { status: 400 },
  invalid_analytics_window: { status: 400 },
  busy: {
    status: 503,
    headers: { 'Retry-After': '1' },
    body: { code: 'busy', message: 'counter storage is temporarily busy' },
  },
}

export const FORBIDDEN: ErrorResponseSpec = {
  status: 403,
  body: { code: 'forbidden', message: 'counter access denied' },
}

/** Response for unexpected or non-domain errors; sanitized so internals never leak. */
export const FALLBACK: ErrorResponseSpec = {
  status: 500,
  body: { code: 'internal', message: 'internal counter error' },
}

export interface ResolvedResponse {
  status: number
  headers: Record<string, string>
  body: ErrorEnvelope
}

function resolve(spec: ErrorResponseSpec, body: ErrorEnvelope): ResolvedResponse {
  return { status: spec.status, headers: spec.headers ?? {}, body }
}

/**
 * Resolves the HTTP response for a domain error code and its message. Unknown
 * codes (and non-domain failures, which never reach here with a known code) fall
 * back to the sanitized 500. Domain-message codes reuse `message`; all others use
 * their static envelope.
 */
export function resolveErrorResponse(code: string, message: string): ResolvedResponse {
  const spec = ERROR_RESPONSES[code]
  if (!spec) return resolveFallback()
  const body = DOMAIN_MESSAGE_CODES.includes(code) ? { code, message } : (spec.body as ErrorEnvelope)
  return resolve(spec, body)
}

export function resolveForbidden(): ResolvedResponse {
  return resolve(FORBIDDEN, FORBIDDEN.body as ErrorEnvelope)
}

export function resolveFallback(): ResolvedResponse {
  return resolve(FALLBACK, FALLBACK.body as ErrorEnvelope)
}

import { readFile } from 'node:fs/promises'

import { expect, test } from 'vitest'

import {
  DOMAIN_MESSAGE_CODES,
  ERROR_RESPONSES,
  FALLBACK,
  FORBIDDEN,
} from '../src/errorContract.js'

interface ErrorContract {
  version: number
  domainMessageCodes: string[]
  responses: Record<string, { status: number; headers?: Record<string, string>; body?: unknown }>
  forbidden: { status: number; body: unknown }
  fallback: { status: number; body: unknown }
}

async function loadContract(): Promise<ErrorContract> {
  const text = await readFile(new URL('../../../contracts/error-responses.json', import.meta.url), 'utf8')
  return JSON.parse(text) as ErrorContract
}

// The Express router's mapping table is a projection of the canonical contract.
// This test fails the moment the two diverge, forcing the single source
// (contracts/error-responses.json) to be updated alongside — which in turn
// obligates every other language's identical guard to follow.
test('mirrors the canonical error-responses contract', async () => {
  const contract = await loadContract()

  expect(DOMAIN_MESSAGE_CODES).toEqual(contract.domainMessageCodes)
  expect(FORBIDDEN.status).toBe(contract.forbidden.status)
  expect(FORBIDDEN.body).toEqual(contract.forbidden.body)
  expect(FALLBACK.status).toBe(contract.fallback.status)
  expect(FALLBACK.body).toEqual(contract.fallback.body)

  for (const [code, spec] of Object.entries(contract.responses)) {
    const local = ERROR_RESPONSES[code]
    expect(local, `missing response for ${code}`).toBeDefined()
    expect(local?.status, `status for ${code}`).toBe(spec.status)
    expect(local?.headers ?? undefined).toEqual(spec.headers)
    // Domain-message codes carry no static body (they reuse the engine message).
    expect(local?.body).toEqual(spec.body)
  }

  expect(Object.keys(ERROR_RESPONSES).sort()).toEqual(Object.keys(contract.responses).sort())
})

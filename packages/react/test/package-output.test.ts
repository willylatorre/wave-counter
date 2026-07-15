import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { beforeAll, expect, test } from 'vitest'

import { npmCommandFor } from './npm-command.js'

const packageDirectory = resolve(import.meta.dirname, '..')
let bundle = ''
let declarations = ''

beforeAll(async () => {
  const npm = npmCommandFor(process.platform)
  execFileSync(npm.command, [...npm.args, 'run', 'build'], {
    cwd: packageDirectory,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit',
  })

  ;[bundle, declarations] = await Promise.all([
    readFile(resolve(packageDirectory, 'dist/index.js'), 'utf8'),
    readFile(resolve(packageDirectory, 'dist/index.d.ts'), 'utf8'),
  ])
})

test('build externalizes React JSX runtime modules', () => {
  expect(bundle).toMatch(/from "react\/jsx-runtime"/)
  expect(bundle).not.toContain('react.transitional.element')
})

test('build preserves Number Flow as a runtime dependency', () => {
  expect(bundle).toMatch(/from ["']@number-flow\/react["']/)
})

test('build publishes the WaveCounterTheme type from the package entrypoint', () => {
  expect(declarations).toContain("export type { WaveCounterProps, WaveCounterTheme } from './WaveCounter.js'")
})

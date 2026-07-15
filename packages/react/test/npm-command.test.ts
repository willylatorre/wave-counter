import { expect, test } from 'vitest'

import { npmCommandFor } from './npm-command.js'

test('uses the current Node executable with npm-cli on win32 when available', () => {
  expect(npmCommandFor('win32', { npm_execpath: 'C:/npm/bin/npm-cli.js' })).toEqual({
    command: process.execPath,
    args: ['C:/npm/bin/npm-cli.js'],
  })
})

test('falls back to the Windows npm launcher when npm_execpath is unavailable', () => {
  expect(npmCommandFor('win32', {})).toEqual({
    command: 'npm.cmd',
    args: [],
  })
})

test('uses npm directly on non-Windows platforms', () => {
  expect(npmCommandFor('darwin')).toEqual({
    command: 'npm',
    args: [],
  })
})

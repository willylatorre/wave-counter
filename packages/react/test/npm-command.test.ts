import { expect, test } from 'vitest'

import { npmCommandFor } from './npm-command.js'

test('uses the Windows npm launcher on win32', () => {
  expect(npmCommandFor('win32')).toBe('npm.cmd')
})

test('uses npm directly on non-Windows platforms', () => {
  expect(npmCommandFor('darwin')).toBe('npm')
})

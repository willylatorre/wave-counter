import { describe, expect, test } from 'vitest'

import { nativeArtifactCandidates } from '../src/native.js'

describe('nativeArtifactCandidates', () => {
  test.each([
    ['darwin', 'arm64', undefined, ['index.darwin-arm64.node']],
    ['darwin', 'x64', undefined, ['index.darwin-x64.node']],
    ['win32', 'x64', undefined, ['index.win32-x64-msvc.node']],
    ['linux', 'x64', 'gnu', ['index.linux-x64-gnu.node']],
    ['linux', 'arm64', 'musl', ['index.linux-arm64-musl.node']],
  ])('maps %s %s %s to its packaged binary', (platform, arch, libc, expected) => {
    expect(nativeArtifactCandidates(platform, arch, libc)).toEqual(expected)
  })
})

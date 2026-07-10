import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface NativeCounter {
  getCounter(key: string): Promise<string>
  recordEvent(key: string, eventId: string): Promise<string>
  analytics(key: string, window: string): Promise<string>
}

interface NativeModule {
  NativeWaveCounter: new (
    databasePath?: string,
    initialCountsJson?: string,
    busyTimeoutMs?: number,
  ) => NativeCounter
}

const packageDirectory = join(dirname(fileURLToPath(import.meta.url)), '..')
const nativeArtifact = readdirSync(packageDirectory).find((entry) => entry.endsWith('.node'))

if (!nativeArtifact) {
  throw new Error(`No native Wave Counter binary found in ${packageDirectory}`)
}

const require = createRequire(import.meta.url)
const native = require(join(packageDirectory, nativeArtifact)) as NativeModule

export const NativeWaveCounter = native.NativeWaveCounter


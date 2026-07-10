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
const packagedArtifacts = new Set(readdirSync(packageDirectory))
const candidates = nativeArtifactCandidates(process.platform, process.arch, runtimeLibc())
const nativeArtifact = candidates.find((entry) => packagedArtifacts.has(entry))

if (!nativeArtifact) {
  throw new Error(
    `No native Wave Counter binary found for ${process.platform}-${process.arch}. Expected ${candidates.join(' or ')} in ${packageDirectory}`,
  )
}

const require = createRequire(import.meta.url)
const native = require(join(packageDirectory, nativeArtifact)) as NativeModule

export const NativeWaveCounter = native.NativeWaveCounter

export function nativeArtifactCandidates(
  platform: string,
  arch: string,
  libc?: 'gnu' | 'musl',
): string[] {
  if (platform === 'win32') return [`index.win32-${arch}-msvc.node`]
  if (platform === 'linux') return [`index.linux-${arch}-${libc ?? 'gnu'}.node`]
  return [`index.${platform}-${arch}.node`]
}

function runtimeLibc(): 'gnu' | 'musl' | undefined {
  if (process.platform !== 'linux') return undefined
  const report = process.report?.getReport() as
    | { header?: { glibcVersionRuntime?: string } }
    | undefined
  return report?.header?.glibcVersionRuntime ? 'gnu' : 'musl'
}

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PUBLIC_PACKAGES = [
  ['@waves-counter/node', 'packages/node/package.json', 'json'],
  ['@waves-counter/client', 'packages/client/package.json', 'json'],
  ['@waves-counter/react', 'packages/react/package.json', 'json'],
  ['@waves-counter/vue', 'packages/vue/package.json', 'json'],
  ['wave-counter', 'python/wave-counter/pyproject.toml', 'toml'],
]

export async function inspectVersions(rootInput) {
  const root = rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  const version = packageJson.version
  const packages = []
  const mismatches = []

  for (const [name, relativePath, format] of PUBLIC_PACKAGES) {
    try {
      const source = await readFile(join(root, relativePath), 'utf8')
      const packageVersion =
        format === 'json'
          ? JSON.parse(source).version
          : source.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
      packages.push({ name, version: packageVersion })
      if (packageVersion !== version) {
        mismatches.push(`${name} is ${packageVersion ?? 'missing a version'}, expected ${version}`)
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }

  try {
    const cargo = await readFile(join(root, 'Cargo.toml'), 'utf8')
    const cargoVersion = cargo.match(/\[workspace\.package\][\s\S]*?^version\s*=\s*"([^"]+)"/m)?.[1]
    if (cargoVersion !== version) {
      mismatches.push(`Cargo workspace is ${cargoVersion ?? 'missing a version'}, expected ${version}`)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  return { version, packages, mismatches }
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const report = await inspectVersions(root)
  if (report.mismatches.length) {
    for (const mismatch of report.mismatches) process.stderr.write(`${mismatch}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(
    `All ${report.packages.length} public packages use version ${report.version}.\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

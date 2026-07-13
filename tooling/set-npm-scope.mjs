import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ALLOWED_SCOPES = new Set(['@waves-counter'])

export function publicationManifests(manifests, scope) {
  if (!ALLOWED_SCOPES.has(scope)) {
    throw new Error(`Unsupported npm scope '${scope}'`)
  }
  const next = structuredClone(manifests)
  next.node.name = `${scope}/node`
  next.client.name = `${scope}/client`
  next.vue.name = `${scope}/vue`
  return next
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const scope = process.argv[2] || '@waves-counter'
  const paths = Object.fromEntries(
    ['node', 'client', 'vue'].map((name) => [name, join(root, `packages/${name}/package.json`)]),
  )
  const manifests = Object.fromEntries(
    await Promise.all(
      Object.entries(paths).map(async ([name, path]) => [
        name,
        JSON.parse(await readFile(path, 'utf8')),
      ]),
    ),
  )
  const rewritten = publicationManifests(manifests, scope)
  await Promise.all(
    Object.entries(paths).map(([name, path]) =>
      writeFile(path, `${JSON.stringify(rewritten[name], null, 2)}\n`),
    ),
  )
  process.stdout.write(`Prepared npm packages for ${scope}.\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

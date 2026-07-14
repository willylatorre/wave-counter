import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { parseDocument } from 'yaml'

const REPOSITORY = 'git+https://github.com/willylatorre/wave-counter.git'

export async function validatePackages(rootInput) {
  const root = rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput
  const errors = []
  const manifests = await Promise.all(
    ['node', 'client', 'react', 'vue'].map(async (name) => [
      name,
      JSON.parse(await readFile(join(root, `packages/${name}/package.json`), 'utf8')),
    ]),
  )

  for (const [name, manifest] of manifests) {
    if (manifest.license !== 'MIT') errors.push(`@waves-counter/${name} must declare MIT`)
    if (manifest.repository?.url !== REPOSITORY) {
      errors.push(`@waves-counter/${name} must declare the canonical repository`)
    }
    if (manifest.publishConfig?.access !== 'public') {
      errors.push(`@waves-counter/${name} must publish with public access`)
    }
    if (!manifest.files?.includes('dist')) errors.push(`@waves-counter/${name} must ship dist`)
  }

  const node = manifests.find(([name]) => name === 'node')?.[1]
  const client = manifests.find(([name]) => name === 'client')?.[1]
  const react = manifests.find(([name]) => name === 'react')?.[1]
  const vue = manifests.find(([name]) => name === 'vue')?.[1]
  if (!node?.files?.includes('*.node')) errors.push('@waves-counter/node must ship native binaries')
  if (node?.engines?.node !== '>=20') errors.push('@waves-counter/node must support Node 20+')
  if (!node?.exports?.['./express']) errors.push('@waves-counter/node must export its Express router')
  if (!client?.exports?.['.']) errors.push('@waves-counter/client must export its browser client')
  if (!react?.exports?.['./styles.css']) errors.push('@waves-counter/react must export default styles')
  if (!react?.peerDependencies?.react?.startsWith('^19')) {
    errors.push('@waves-counter/react must declare React 19 as a peer')
  }
  if (react?.dependencies?.react) errors.push('@waves-counter/react must not bundle React')
  if (!vue?.exports?.['./styles.css']) errors.push('@waves-counter/vue must export default styles')
  if (!vue?.peerDependencies?.vue?.startsWith('^3.5')) {
    errors.push('@waves-counter/vue must declare Vue 3.5 as a peer')
  }
  if (vue?.dependencies?.vue) errors.push('@waves-counter/vue must not bundle Vue')

  const python = await readFile(join(root, 'python/wave-counter/pyproject.toml'), 'utf8')
  if (!python.includes('requires-python = ">=3.10"')) {
    errors.push('wave-counter must support Python 3.10+')
  }
  if (!python.includes('module-name = "wave_counter._native"')) {
    errors.push('wave-counter must build the native module with maturin')
  }

  const ci = await readFile(join(root, '.github/workflows/ci.yml'), 'utf8')
  const release = await readFile(join(root, '.github/workflows/release.yml'), 'utf8')
  for (const [name, source] of [
    ['ci.yml', ci],
    ['release.yml', release],
  ]) {
    const document = parseDocument(source)
    for (const error of document.errors) errors.push(`${name}: ${error.message}`)
  }

  for (const pythonVersion of ['3.10', '3.11', '3.12', '3.13', '3.14']) {
    if (!ci.includes(`'${pythonVersion}'`)) errors.push(`CI must cover Python ${pythonVersion}`)
  }
  for (const nodeVersion of ['20', '22', '24']) {
    if (!ci.match(new RegExp(`node: \\[.*\\b${nodeVersion}\\b`))) {
      errors.push(`CI must cover Node ${nodeVersion}`)
    }
  }
  for (const os of ['ubuntu-latest', 'macos-latest', 'windows-latest']) {
    if (!ci.includes(os) || !release.includes(os)) errors.push(`workflows must cover ${os}`)
  }
  if (!ci.includes('playwright install --with-deps chromium')) {
    errors.push('CI must install Playwright Chromium')
  }
  for (const runtimeSmokeRequirement of [
    'runtime-smoke-node:',
    'runtime-smoke-python:',
    'npm install ../artifacts/npm/*.tgz',
    'uv pip install --python runtime-smoke-python artifacts/python/*.whl',
  ]) {
    if (!ci.includes(runtimeSmokeRequirement)) {
      errors.push(`CI runtime smoke must include ${runtimeSmokeRequirement}`)
    }
  }
  for (const action of [
    'actions/checkout@v6',
    'actions/setup-node@v6',
    'actions/upload-artifact@v7',
    'actions/download-artifact@v7',
  ]) {
    if (!release.includes(action)) errors.push(`release must use ${action}`)
  }
  if (!release.includes('id-token: write')) errors.push('release must enable OIDC')
  if (!release.includes('pypa/gh-action-pypi-publish@release/v1')) {
    errors.push('release must use PyPI trusted publishing')
  }
  if (
    !release.includes('node tooling/set-npm-scope.mjs') ||
    !['client', 'node', 'react', 'vue'].every((name) =>
      release.includes(`npm publish ./packages/${name}`),
    )
  ) {
    errors.push('release must prepare and publish all npm packages')
  }
  return errors
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const errors = await validatePackages(root)
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write('Package manifests and release workflows are consistent.\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

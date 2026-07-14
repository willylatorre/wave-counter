import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { inspectVersions } from './check-versions.mjs'
import { validateConformance } from './check-conformance.mjs'
import { validatePackages } from './check-packages.mjs'
import { publicationManifests } from './set-npm-scope.mjs'

test('accepts the repository coordinated version', async () => {
  const report = await inspectVersions(new URL('..', import.meta.url))

  assert.match(report.version, /^\d+\.\d+\.\d+$/)
  assert.equal(report.packages.length, 5)
  assert.deepEqual(
    report.packages.find((packageInfo) => packageInfo.name === '@waves-counter/react'),
    { name: '@waves-counter/react', version: report.version },
  )
  assert.deepEqual(report.mismatches, [])
})

test('reports package version drift', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'wave-counter-versions-'))
  await writeFile(join(directory, 'package.json'), JSON.stringify({ version: '1.0.0' }))
  await writeFile(join(directory, 'Cargo.toml'), '[workspace.package]\nversion = "2.0.0"\n')

  const report = await inspectVersions(directory)

  assert.equal(report.mismatches.length, 1)
  assert.match(report.mismatches[0] ?? '', /Cargo workspace/)
})

test('validates required conformance scenarios and HTTP routes', async () => {
  const fixture = JSON.parse(
    await (await import('node:fs/promises')).readFile(
      new URL('../contracts/conformance.json', import.meta.url),
      'utf8',
    ),
  )

  assert.deepEqual(validateConformance(fixture), [])
})

test('rejects an incomplete conformance fixture', () => {
  const errors = validateConformance({ version: 1, scenarios: [] })

  assert.ok(errors.some((error) => error.includes('idempotent replay')))
  assert.ok(errors.some((error) => error.includes('analytics window')))
})

test('validates public package manifests and release workflows', async () => {
  const errors = await validatePackages(new URL('..', import.meta.url))

  assert.deepEqual(errors, [])
})

test('integrates the React package into consumer documentation and releases', async () => {
  const root = new URL('..', import.meta.url)
  const [rootReadme, ci, release] = await Promise.all([
    readFile(new URL('../README.md', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8'),
  ])

  assert.match(rootReadme, /@waves-counter\/react/)
  assert.match(ci, /npm test --workspace @waves-counter\/react/)
  assert.match(release, /npm run build --workspace @waves-counter\/react/)
  assert.match(release, /npm publish \.\/packages\/react/)
})

test('prepares the canonical npm scope', () => {
  const manifests = publicationManifests(
    {
      node: { name: '@waves-counter/node' },
      client: { name: '@waves-counter/client' },
      react: { name: '@waves-counter/react' },
      vue: {
        name: '@waves-counter/vue',
        version: '0.1.0',
        dependencies: { '@waves-counter/client': '0.1.0' },
      },
    },
    '@waves-counter',
  )

  assert.equal(manifests.node.name, '@waves-counter/node')
  assert.equal(manifests.client.name, '@waves-counter/client')
  assert.equal(manifests.react.name, '@waves-counter/react')
  assert.equal(manifests.vue.name, '@waves-counter/vue')
  assert.equal(manifests.vue.dependencies['@waves-counter/client'], '0.1.0')
})

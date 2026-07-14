import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// Verifies that the hand-mirrored DTO shapes in Rust, Python, Node, and the
// browser client all match the canonical wire schema in contracts/dto-schema.json.
// Field names are compared in camelCase (the serialized form); Rust's snake_case
// struct fields are converted before comparison. A missing, extra, or renamed
// field in any language is reported so the four copies cannot silently drift.

const snakeToCamel = (name) => name.replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase())

/** Extracts the `{ ... }` body that follows `keyword Name`, balancing braces. */
function extractBlock(source, keyword, name) {
  const header = new RegExp(`${keyword}\\s+${name}\\b`).exec(source)
  if (!header) return null
  const open = source.indexOf('{', header.index)
  if (open === -1) return null
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  return null
}

export function rustFields(source, name) {
  const block = extractBlock(source, 'struct', name)
  if (block === null) return null
  return block
    .split('\n')
    .map((line) => /^\s*pub\s+([a-z_][a-z0-9_]*)\s*:/.exec(line)?.[1])
    .filter(Boolean)
    .map(snakeToCamel)
}

export function pythonFields(source, name) {
  // A TypedDict class body runs until the next top-level `class` or blank-line gap.
  const start = new RegExp(`class\\s+${name}\\(TypedDict\\):`).exec(source)
  if (!start) return null
  const rest = source.slice(start.index + start[0].length)
  const end = /\nclass\s/.exec(rest)?.index ?? rest.length
  return rest
    .slice(0, end)
    .split('\n')
    .map((line) => /^\s{4}([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(line)?.[1])
    .filter(Boolean)
}

export function tsFields(source, name) {
  const block = extractBlock(source, 'interface', name)
  if (block === null) return null
  return block
    .split('\n')
    .map((line) => /^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(line)?.[1])
    .filter(Boolean)
}

const PARSERS = { rust: rustFields, python: pythonFields, node: tsFields, client: tsFields }

export async function inspectDtos(rootInput) {
  const root = rootInput instanceof URL ? fileURLToPath(rootInput) : rootInput
  const schema = JSON.parse(await readFile(join(root, 'contracts/dto-schema.json'), 'utf8'))
  const errors = []

  const sources = {}
  for (const [language, declaration] of Object.entries(schema.declarations)) {
    sources[language] = await readFile(join(root, declaration.path), 'utf8')
  }

  for (const [typeName, definition] of Object.entries(schema.types)) {
    const expected = [...definition.fields].sort()
    const languages = definition.languages ?? Object.keys(PARSERS)
    for (const language of languages) {
      const parse = PARSERS[language]
      const declaredName = language === 'rust' ? definition.rust : typeName
      const fields = parse(sources[language], declaredName)
      if (fields === null) {
        errors.push(`${language}: ${declaredName} not found for ${typeName}`)
        continue
      }
      const actual = [...fields].sort()
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        errors.push(
          `${language}: ${declaredName} fields [${actual.join(', ')}] do not match schema [${expected.join(', ')}]`,
        )
      }
    }
  }

  return { types: Object.keys(schema.types), errors }
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const report = await inspectDtos(root)
  if (report.errors.length) {
    for (const error of report.errors) process.stderr.write(`${error}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(
    `DTO schema covers ${report.types.length} types, consistent across all four languages.\n`,
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

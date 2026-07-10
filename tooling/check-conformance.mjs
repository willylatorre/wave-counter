import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function validateConformance(fixture) {
  const errors = []
  if (fixture?.version !== 1) errors.push('fixture version must be 1')
  if (!Array.isArray(fixture?.scenarios)) return [...errors, 'scenarios must be an array']

  const scenarios = fixture.scenarios
  const steps = scenarios.flatMap((scenario) => scenario.steps ?? [])
  const hasStep = (predicate) => steps.some(predicate)

  if (!hasStep((step) => step.method === 'GET' && step.path === '/counters/coffee')) {
    errors.push('missing virtual zero counter scenario')
  }
  if (!scenarios.some((scenario) => scenario.initialCounts?.coffee === 67)) {
    errors.push('missing configured baseline scenario')
  }
  if (
    !scenarios.some((scenario) => {
      const eventSteps = (scenario.steps ?? []).filter(
        (step) => step.method === 'POST' && step.path === '/counters/coffee/events',
      )
      return (
        eventSteps.length === 2 &&
        eventSteps[0]?.status === 201 &&
        eventSteps[1]?.status === 200 &&
        eventSteps[0]?.json?.eventId === eventSteps[1]?.json?.eventId
      )
    })
  ) {
    errors.push('missing idempotent replay scenario with 201 then 200')
  }
  if (!hasStep((step) => step.path?.includes('analytics?window=30d') && step.status === 400)) {
    errors.push('missing invalid analytics window scenario')
  }
  if (!hasStep((step) => step.path === '/counters/Coffee' && step.status === 400)) {
    errors.push('missing invalid counter key scenario')
  }
  if (
    !hasStep(
      (step) =>
        step.path === '/counters/coffee/events' &&
        step.status === 400 &&
        step.body?.error?.code === 'invalid_event_id',
    )
  ) {
    errors.push('missing invalid event ID scenario')
  }
  return errors
}

async function main() {
  const root = dirname(dirname(fileURLToPath(import.meta.url)))
  const fixture = JSON.parse(await readFile(join(root, 'contracts/conformance.json'), 'utf8'))
  const errors = validateConformance(fixture)
  if (errors.length) {
    for (const error of errors) process.stderr.write(`${error}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`Conformance fixture ${fixture.version} covers ${fixture.scenarios.length} scenarios.\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main()

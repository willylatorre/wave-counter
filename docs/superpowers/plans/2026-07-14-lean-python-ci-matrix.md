# Lean Python CI Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Python CI duplication from 15 to nine OS/interpreter combinations in each Python matrix without changing supported versions or release builds.

**Architecture:** Represent the intended compatibility coverage as explicit `matrix.include` entries in both the source-test and wheel-install jobs. Add a tooling regression test that parses the workflow and locks both jobs to the same nine pairs.

**Tech Stack:** GitHub Actions YAML, Node.js test runner, `yaml` package.

## Global Constraints

- Ubuntu covers Python 3.10, 3.11, 3.12, 3.13, and 3.14.
- macOS covers Python 3.10 and 3.14.
- Windows covers Python 3.10 and 3.14.
- `python` and `runtime-smoke-python` use identical matrices.
- Package smoke, release, Node.js, and supported-version declarations remain unchanged.
- Preserve unrelated working-tree changes and stage only the two files in this plan.

---

### Task 1: Lock and reduce the Python CI matrices

**Files:**
- Modify: `tooling/checks.test.mjs`
- Modify: `.github/workflows/ci.yml`
- Test: `tooling/checks.test.mjs`

**Interfaces:**
- Consumes: GitHub Actions job definitions at `jobs.python.strategy.matrix` and `jobs.runtime-smoke-python.strategy.matrix`.
- Produces: Identical arrays of `{ os: string, python: string }` entries for both jobs.

- [ ] **Step 1: Add the failing matrix regression test**

Add `readFile` to the existing `node:fs/promises` import and `parseDocument` from `yaml`:

```js
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { parseDocument } from 'yaml'
```

Add this test after the existing package/workflow validation test:

```js
test('uses the lean Python compatibility matrix for tests and wheel installs', async () => {
  const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const workflow = parseDocument(source).toJS()
  const expected = [
    { os: 'ubuntu-latest', python: '3.10' },
    { os: 'ubuntu-latest', python: '3.11' },
    { os: 'ubuntu-latest', python: '3.12' },
    { os: 'ubuntu-latest', python: '3.13' },
    { os: 'ubuntu-latest', python: '3.14' },
    { os: 'macos-latest', python: '3.10' },
    { os: 'macos-latest', python: '3.14' },
    { os: 'windows-latest', python: '3.10' },
    { os: 'windows-latest', python: '3.14' },
  ]

  assert.deepEqual(workflow.jobs.python.strategy.matrix.include, expected)
  assert.deepEqual(workflow.jobs['runtime-smoke-python'].strategy.matrix.include, expected)
})
```

- [ ] **Step 2: Run the regression test and verify it fails for the current Cartesian matrix**

Run:

```bash
node --test --test-name-pattern='lean Python compatibility matrix' tooling/checks.test.mjs
```

Expected: FAIL because `matrix.include` is absent from the current workflow.

- [ ] **Step 3: Replace both Cartesian Python matrices with explicit entries**

In both `python` and `runtime-smoke-python`, replace the `os` and `python` arrays under `matrix` with:

```yaml
        include:
          - os: ubuntu-latest
            python: '3.10'
          - os: ubuntu-latest
            python: '3.11'
          - os: ubuntu-latest
            python: '3.12'
          - os: ubuntu-latest
            python: '3.13'
          - os: ubuntu-latest
            python: '3.14'
          - os: macos-latest
            python: '3.10'
          - os: macos-latest
            python: '3.14'
          - os: windows-latest
            python: '3.10'
          - os: windows-latest
            python: '3.14'
```

- [ ] **Step 4: Run the focused regression test and verify it passes**

Run:

```bash
node --test --test-name-pattern='lean Python compatibility matrix' tooling/checks.test.mjs
```

Expected: PASS with one matching test and no failures.

- [ ] **Step 5: Run complete workflow/tooling verification**

Run:

```bash
npm run test:tooling
npm run check
git diff --check -- .github/workflows/ci.yml tooling/checks.test.mjs
```

Expected: all tooling tests pass, package/workflow checks report consistency, and `git diff --check` emits no errors.

- [ ] **Step 6: Commit only the CI workflow and its regression test**

```bash
git add .github/workflows/ci.yml tooling/checks.test.mjs
git commit -m "ci: reduce Python compatibility matrix"
```

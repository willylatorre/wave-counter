# Lean Runtime CI Matrix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Python and Node CI duplication by testing current runtimes across supported operating systems without changing package version support or release builds.

**Architecture:** Represent the intended runtime coverage as explicit `matrix.include` entries in the source-test and package-install jobs. Add tooling regression tests that parse the workflow and lock the Python and Node jobs to the expected pairs.

**Tech Stack:** GitHub Actions YAML, Node.js test runner, `yaml` package.

## Global Constraints

- Python CI covers Python 3.14 on Ubuntu, macOS, and Windows.
- Node CI covers Node 24 and 26 on Ubuntu, macOS, and Windows.
- `python` and `runtime-smoke-python` use identical matrices.
- `node` and `runtime-smoke-node` use identical matrices.
- Package smoke, release, and supported-version declarations remain unchanged.
- Preserve unrelated working-tree changes and stage only the files in this plan.

---

### Task 1: Lock and reduce the runtime CI matrices

**Files:**
- Modify: `tooling/checks.test.mjs`
- Modify: `tooling/check-packages.mjs`
- Modify: `.github/workflows/ci.yml`
- Test: `tooling/checks.test.mjs`

**Interfaces:**
- Consumes: GitHub Actions job definitions at `jobs.python.strategy.matrix`, `jobs.runtime-smoke-python.strategy.matrix`, `jobs.node.strategy.matrix`, and `jobs.runtime-smoke-node.strategy.matrix`.
- Produces: explicit current-runtime `matrix.include` entries for all four jobs.

- [ ] **Step 1: Add the failing matrix regression test**

Add `readFile` to the existing `node:fs/promises` import and `parseDocument` from `yaml`:

```js
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { parseDocument } from 'yaml'
```

Add this test after the existing package/workflow validation test:

```js
test('uses lean current runtime CI matrices', async () => {
  const source = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const workflow = parseDocument(source).toJS()
  const expectedPython = [
    { os: 'ubuntu-latest', python: '3.14' },
    { os: 'macos-latest', python: '3.14' },
    { os: 'windows-latest', python: '3.14' },
  ]
  const expectedNode = [
    { os: 'ubuntu-latest', node: 24 },
    { os: 'ubuntu-latest', node: 26 },
    { os: 'macos-latest', node: 24 },
    { os: 'macos-latest', node: 26 },
    { os: 'windows-latest', node: 24 },
    { os: 'windows-latest', node: 26 },
  ]

  assert.deepEqual(workflow.jobs.python.strategy.matrix, { include: expectedPython })
  assert.deepEqual(workflow.jobs['runtime-smoke-python'].strategy.matrix, { include: expectedPython })
  assert.deepEqual(workflow.jobs.node.strategy.matrix, { include: expectedNode })
  assert.deepEqual(workflow.jobs['runtime-smoke-node'].strategy.matrix, { include: expectedNode })
})
```

- [ ] **Step 2: Run the regression test and verify it fails for the current Cartesian matrix**

Run:

```bash
node --test --test-name-pattern='lean current runtime CI matrices' tooling/checks.test.mjs
```

Expected: FAIL because `matrix.include` is absent from the old Cartesian workflow.

- [ ] **Step 3: Replace Cartesian Python and Node matrices with explicit entries**

In both `python` and `runtime-smoke-python`, replace the `os` and `python` arrays under `matrix` with:

```yaml
        include:
          - os: ubuntu-latest
            python: '3.14'
          - os: macos-latest
            python: '3.14'
          - os: windows-latest
            python: '3.14'
```

In both `node` and `runtime-smoke-node`, replace the `os` and `node` arrays under `matrix` with Node 24 and 26 on all three operating systems.

- [ ] **Step 4: Update package workflow validation**

Change `tooling/check-packages.mjs` to parse `.github/workflows/ci.yml` and assert the exact current-runtime matrices structurally.

- [ ] **Step 5: Run the focused regression test and verify it passes**

Run:

```bash
node --test --test-name-pattern='lean current runtime CI matrices' tooling/checks.test.mjs
```

Expected: PASS with one matching test and no failures.

- [ ] **Step 6: Run complete workflow/tooling verification**

Run:

```bash
npm run test:tooling
npm run check
git diff --check -- .github/workflows/ci.yml tooling/checks.test.mjs tooling/check-packages.mjs
```

Expected: all tooling tests pass, package/workflow checks report consistency, and `git diff --check` emits no errors.

- [ ] **Step 7: Commit only the CI workflow and tooling guardrails**

```bash
git add .github/workflows/ci.yml tooling/checks.test.mjs tooling/check-packages.mjs
git commit -m "ci: test current runtime versions"
```

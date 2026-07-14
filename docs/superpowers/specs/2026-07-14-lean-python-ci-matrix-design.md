# Lean Runtime CI Matrix

## Goal

Reduce duplicate GitHub Actions work while preserving meaningful runtime coverage for the native Python and Node packages across Linux, macOS, and Windows.

## Design

The `python` source-test job and `runtime-smoke-python` wheel-install job use the same explicit matrix:

- Ubuntu: Python 3.14.
- macOS: Python 3.14.
- Windows: Python 3.14.

The `node` source-test job and `runtime-smoke-node` package-install job use the same explicit matrix:

- Ubuntu: Node 24 and 26.
- macOS: Node 24 and 26.
- Windows: Node 24 and 26.

This keeps CI focused on current production runtimes: Python 3.14, Node 24 LTS, and Node 26 current. Explicit matrix entries make the intended combinations visible and avoid accidental Cartesian products.

Package smoke builds and release builds remain unchanged at one native wheel per operating system. The package uses `abi3-py310`, so each operating-system wheel is designed to work across the supported Python versions.

## Verification

- Parse `.github/workflows/ci.yml` as YAML.
- Assert that both Python matrices contain exactly the three intended OS/version pairs.
- Assert that both Node matrices contain exactly the six intended OS/version pairs.
- Run the repository's existing tooling tests, which validate package and workflow consistency.

## Non-goals

- Changing the supported Python version range.
- Changing the supported Node.js version range.
- Changing package or release publishing behavior.

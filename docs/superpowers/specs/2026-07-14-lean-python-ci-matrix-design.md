# Lean Python CI Matrix

## Goal

Reduce duplicate GitHub Actions work while preserving meaningful compatibility coverage for the native Python package across Python 3.10 through 3.14 and Linux, macOS, and Windows.

## Design

Both the `python` source-test job and `runtime-smoke-python` wheel-install job will use the same explicit matrix:

- Ubuntu: Python 3.10, 3.11, 3.12, 3.13, and 3.14.
- macOS: Python 3.10 and 3.14.
- Windows: Python 3.10 and 3.14.

This retains exhaustive interpreter-version coverage on the primary CI platform and checks the minimum and maximum supported interpreter on the other operating systems. Explicit matrix entries make the intended nine combinations visible and avoid a Cartesian product followed by exclusions.

Package smoke builds and release builds remain unchanged at one native wheel per operating system. The package uses `abi3-py310`, so each operating-system wheel is designed to work across the supported Python versions.

## Verification

- Parse `.github/workflows/ci.yml` as YAML.
- Assert that both Python matrices contain exactly the nine intended OS/version pairs.
- Run the repository's existing tooling tests, which validate package and workflow consistency.

## Non-goals

- Changing the supported Python version range.
- Changing Node.js CI coverage.
- Changing package or release publishing behavior.

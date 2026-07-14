# AGENTS.md

Orientation for agents working in this repo. Read this first, then the doc that
matches your task.

## What this is

Wave Counter: self-hosted anonymous counters for websites and apps. A Rust
storage engine is shared across Python and Node through native bindings; a
framework-neutral browser client backs accessible React and Vue components. The
host app owns auth, CORS, rate limiting, deployment, backups, and the SQLite file.

## Where things live

| Package | Path | Role |
| --- | --- | --- |
| `wave-counter-core` | `crates/wave-counter-core` | **All domain logic** — the single source of truth. Rust. |
| `wave-counter` (Python) | `python/wave-counter` | pyo3 binding + optional FastAPI router. |
| `@waves-counter/node` | `packages/node` | napi binding + Express router. |
| `@waves-counter/client` | `packages/client` | Framework-neutral browser client + optimistic-state controller. |
| `@waves-counter/react` | `packages/react` | React component + `useWaveCounter` hook. |
| `@waves-counter/vue` | `packages/vue` | Vue component + `useWaveCounter` composable. |
| Conformance fixture | `contracts/conformance.json` | Shared HTTP scenarios replayed by both routers' tests. |
| Repo checks | `tooling/` | Version, package-manifest, and conformance validation. |

## Read before you change code

- **[CONTEXT.md](CONTEXT.md)** — domain vocabulary and the **architectural
  invariants** (single-sourced core, `code|message` error format, seven-day UTC
  window, host-owned SQLite, hand-mirrored DTOs). Start here for any code change.
- **[PRODUCT.md](PRODUCT.md)** — product purpose, users, brand, accessibility
  bar. Read before touching UX, copy, or component behavior.
- **[DESIGN.md](DESIGN.md)** — the visual design system (color, type, motion,
  component specs). Read before touching styling or the components.
- **[README.md](README.md)** — public usage, HTTP contract, install, releases.

## Rules of thumb

- **Do not reimplement domain logic in a binding or the frontend.** Validation,
  idempotency, and analytics math live in `crates/wave-counter-core`. Bindings
  pass through. (CONTEXT.md, invariant #1.)
- **The HTTP error→status mapping is duplicated** in the FastAPI and Express
  routers and must stay in lockstep. Edit both together. (CONTEXT.md, invariant
  #3.)
- **Accessible analytics text must match across React and Vue.** (CONTEXT.md,
  invariant #7.)
- New public API changes usually touch four type mirrors — see CONTEXT.md
  invariant #5.

## Build & test

Requires Rust stable, Node 20+, npm 11, Python 3.10+, and uv.

```bash
npm install
cargo test --workspace
uv run --project python/wave-counter pytest
npm test --workspace @waves-counter/client
npm test --workspace @waves-counter/react
npm test --workspace @waves-counter/vue
npm test --workspace @waves-counter/node
npm test --workspace @waves-counter/playground
npm run check   # coordinated versions, conformance, manifests, release workflows
```

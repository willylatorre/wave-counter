# Analytics Windows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 7d, 1M, and all-time analytics windows across the storage contract, client controller, React component, and Vue component.

**Architecture:** Extend the shared `AnalyticsWindow` contract first, then let HTTP clients and framework components pass the selected window into the same analytics endpoint. Keep daily UTC buckets for all windows; `all` begins at the first event for the counter and has no previous-period comparison.

**Tech Stack:** Rust core with SQLite, Node/Python native bindings, TypeScript client/controller, React 19, Vue 3, Vitest, Cargo tests.

## Global Constraints

- Keep `7d` as the default analytics window.
- Supported window wire values are exactly `7d`, `1M`, and `all`.
- Keep analytics secondary and quiet in the modal.
- Use test-first changes for behavior.
- Do not introduce new runtime dependencies.

---

### Task 1: Core Analytics Windows

**Files:**
- Modify: `crates/wave-counter-core/src/model.rs`
- Modify: `crates/wave-counter-core/src/store.rs`
- Test: `crates/wave-counter-core/tests/engine.rs`

**Interfaces:**
- Produces: `AnalyticsWindow::{SevenDays, OneMonth, AllTime}` with `as_str() -> "7d" | "1M" | "all"`.
- Produces: `WaveCounter::analytics(key, window, now)` returning daily UTC buckets for each supported window.

- [ ] **Step 1: Write failing Rust tests** for parsing `1M` and `all`, returning 30 daily buckets for `1M`, and returning first-event-through-today buckets for `all`.
- [ ] **Step 2: Run targeted Cargo test** with `cargo test -p wave-counter-core analytics_window --test engine` or the nearest available targeted test command and confirm failure.
- [ ] **Step 3: Implement the Rust enum and query window selection** with one helper that returns current start, current end, optional previous start, and bucket count/start policy.
- [ ] **Step 4: Run targeted Cargo tests** and confirm pass.

### Task 2: Shared Client And Controller

**Files:**
- Modify: `packages/client/src/types.ts`
- Modify: `packages/client/src/client.ts`
- Modify: `packages/client/src/controller.ts`
- Test: `packages/client/test/client.test.ts`
- Test: `packages/client/test/controller.test.ts`

**Interfaces:**
- Produces: `type AnalyticsWindow = '7d' | '1M' | 'all'`.
- Produces: `WaveCounterTransport.getAnalytics(key, window?)`.
- Produces: controller state fields `analyticsWindow` and methods `setAnalyticsWindow(window)` and `loadAnalytics(window?)`.

- [ ] **Step 1: Write failing Vitest tests** showing `getAnalytics('coffee', '1M')` requests `window=1M`, the controller opens with `7d`, and changing to `all` reloads analytics.
- [ ] **Step 2: Run `npm test --workspace @waves-counter/client` and confirm failure.**
- [ ] **Step 3: Implement minimal TypeScript API changes** while keeping the default `7d` behavior.
- [ ] **Step 4: Run client tests and typecheck.**

### Task 3: React And Vue Modal Selector

**Files:**
- Modify: `packages/react/src/WaveCounter.tsx`
- Modify: `packages/react/src/useWaveCounter.ts`
- Modify: `packages/vue/src/WaveCounter.vue`
- Modify: `packages/vue/src/useWaveCounter.ts`
- Modify: `packages/vue/src/styles.css`
- Modify: `packages/react/src/styles.css`
- Test: `packages/react/test/WaveCounter.test.tsx`
- Test: `packages/vue/test/WaveCounter.test.ts`

**Interfaces:**
- Consumes: controller `analyticsWindow`, `setAnalyticsWindow`, and `loadAnalytics`.
- Produces: default modal segmented control labels `7D`, `1M`, and `All`.
- Produces: render prop / slot analytics state including selected `window` and `setWindow`.

- [ ] **Step 1: Write failing React and Vue tests** that open stats, click `1M` or `All`, and assert the transport receives the selected window.
- [ ] **Step 2: Run React/Vue package tests and confirm failure.**
- [ ] **Step 3: Implement the selector with restrained existing styles** using full borders, focus-visible support, and no new color vocabulary.
- [ ] **Step 4: Run React/Vue tests and typechecks.**

### Task 4: Contract And Docs Touch-Up

**Files:**
- Modify: `contracts/conformance.json`
- Modify: `README.md`
- Modify: package READMEs if their contract snippets mention only `7d`.

**Interfaces:**
- Produces: docs that name `7d`, `1M`, and `all`.
- Preserves: invalid `30d` conformance case.

- [ ] **Step 1: Update contract/docs after code behavior is green.**
- [ ] **Step 2: Run root verification: `npm test`, `npm run typecheck`, relevant Cargo tests, and package builds where feasible.**

## Self-Review

- Spec coverage: API windows, default behavior, and modal selector are covered.
- Placeholder scan: no placeholders remain.
- Type consistency: `AnalyticsWindow`, `analyticsWindow`, and `setAnalyticsWindow` are the shared names across tasks.

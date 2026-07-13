# Wave Counter Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add light, dark, and automatic color-scheme support to the Vue Wave Counter component.

**Architecture:** The component exposes a small `theme` prop and reflects it as `data-theme`. CSS owns the token palettes, preserving existing custom-property overrides. Tests assert public API behavior and stylesheet support.

**Tech Stack:** Vue 3, TypeScript, Vitest, CSS custom properties, OKLCH colors.

## Global Constraints

- Default theme is `auto`.
- Explicit modes are `light` and `dark`.
- Existing host overrides through `--wave-counter-*` variables must keep working.
- Dark theme must stay calm and product-like, not neon-on-black.

---

### Task 1: Theme API and Tokens

**Files:**
- Modify: `packages/vue/src/WaveCounter.vue`
- Modify: `packages/vue/src/styles.css`
- Modify: `packages/vue/test/WaveCounter.test.ts`
- Modify: `packages/vue/README.md`

**Interfaces:**
- Produces: `theme?: 'auto' | 'light' | 'dark'` prop on `WaveCounter`.
- Produces: `.wave-counter[data-theme='auto' | 'light' | 'dark']` styling hooks.

- [ ] **Step 1: Write the failing tests**

Add tests that default `data-theme` to `auto`, pass through `theme="light"` and `theme="dark"`, and assert the stylesheet contains explicit light, dark, and prefers-color-scheme dark rules.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace @waves-counter/vue -- WaveCounter.test.ts`

Expected: FAIL because `data-theme` and the CSS theme rules do not exist.

- [ ] **Step 3: Implement the prop and CSS tokens**

Add the typed prop/default in `WaveCounter.vue`, bind it on the root, and move color defaults into light/dark token layers in `styles.css`.

- [ ] **Step 4: Update docs**

Document `theme` in `packages/vue/README.md` with light, dark, and auto examples.

- [ ] **Step 5: Verify**

Run:

```bash
npm test --workspace @waves-counter/vue
npm run typecheck --workspace @waves-counter/vue
npm run build --workspace @waves-counter/vue
```

Expected: all pass.

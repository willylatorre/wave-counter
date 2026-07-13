<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import { WaveCounter } from '@waves-counter/vue'

type Backend = 'fastapi' | 'express'

const requested = new URL(window.location.href).searchParams.get('backend')
const backend = ref<Backend>(requested === 'express' ? 'express' : 'fastapi')
const endpoint = computed(() => `/api/${backend.value}`)
const counterError = ref<string | null>(null)

watch(backend, (value) => {
  const url = new URL(window.location.href)
  url.searchParams.set('backend', value)
  window.history.replaceState({}, '', url)
  counterError.value = null
})
</script>

<template>
  <main>
    <header>
      <a class="wordmark" href="/">Wave Counter</a>
      <label>
        <span>Backend</span>
        <select v-model="backend" aria-label="Backend">
          <option value="fastapi">FastAPI</option>
          <option value="express">Express</option>
        </select>
      </label>
    </header>

    <section class="stage" aria-labelledby="playground-title">
      <div class="copy">
        <p class="eyebrow">Executable documentation</p>
        <h1 id="playground-title">Wave Counter playground</h1>
        <p>
          Click to record one event. Right click, long press, or use
          <kbd>Shift</kbd> + <kbd>F10</kbd> to see seven-day activity.
        </p>
      </div>

      <div class="instrument">
        <WaveCounter
          :key="backend"
          counter-key="coffee"
          :endpoint="endpoint"
          @error="counterError = $event.message"
        />
        <p class="backend-status">
          Connected through <strong>{{ backend === 'fastapi' ? 'FastAPI' : 'Express' }}</strong>
        </p>
        <p v-if="counterError" class="error" role="alert">{{ counterError }}</p>
      </div>
    </section>

    <footer>
      <span>Rust + SQLite</span>
      <span aria-hidden="true">·</span>
      <span>Anonymous events</span>
      <span aria-hidden="true">·</span>
      <span>UTC analytics</span>
    </footer>
  </main>
</template>

<style>
:root {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  color: oklch(28% 0.018 215);
  background: oklch(96% 0.015 205);
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 20rem;
  min-height: 100vh;
  margin: 0;
}

button,
select {
  font: inherit;
}

main {
  width: min(70rem, 100%);
  min-height: 100vh;
  display: grid;
  grid-template-rows: auto 1fr auto;
  margin: 0 auto;
  padding: 1.25rem clamp(1rem, 4vw, 3rem) 1.5rem;
}

header,
footer {
  display: flex;
  align-items: center;
}

header {
  justify-content: space-between;
  gap: 1rem;
}

.wordmark {
  color: inherit;
  font-weight: 760;
  letter-spacing: -0.025em;
  text-decoration: none;
}

label {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  color: oklch(48% 0.025 215);
  font-size: 0.75rem;
  font-weight: 650;
}

select {
  min-height: 2.5rem;
  padding: 0.45rem 2rem 0.45rem 0.7rem;
  border: 1px solid oklch(82% 0.022 205);
  border-radius: 0.7rem;
  background: oklch(98.5% 0.008 205);
  color: oklch(28% 0.018 215);
}

select:focus-visible,
.wordmark:focus-visible {
  outline: 3px solid oklch(59% 0.12 194 / 0.45);
  outline-offset: 2px;
}

.stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(16rem, 0.8fr);
  align-items: center;
  gap: clamp(3rem, 8vw, 8rem);
  padding-block: 5rem;
}

.copy {
  max-width: 36rem;
}

.eyebrow {
  margin: 0 0 0.75rem;
  color: oklch(48% 0.12 194);
  font-size: 0.7rem;
  font-weight: 720;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1 {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(2.75rem, 7vw, 5.75rem);
  font-weight: 760;
  line-height: 0.94;
  letter-spacing: -0.055em;
}

.copy > p:last-child {
  max-width: 53ch;
  margin: 1.5rem 0 0;
  color: oklch(47% 0.025 215);
  font-size: 1rem;
  line-height: 1.65;
}

kbd {
  padding: 0.1rem 0.35rem;
  border: 1px solid oklch(78% 0.02 205);
  border-bottom-width: 2px;
  border-radius: 0.3rem;
  background: oklch(98.5% 0.008 205);
  color: oklch(35% 0.02 215);
  font-family: inherit;
  font-size: 0.75em;
}

.instrument {
  min-height: 18rem;
  display: grid;
  place-items: center;
  align-content: center;
  padding: clamp(2rem, 7vw, 5rem);
  border: 1px solid oklch(84% 0.02 205);
  border-radius: 2rem;
  background: oklch(98.5% 0.008 205);
  box-shadow: 0 24px 70px oklch(28% 0.018 215 / 0.09);
}

.backend-status {
  margin: 1rem 0 0;
  color: oklch(52% 0.025 215);
  font-size: 0.72rem;
}

.backend-status strong {
  color: oklch(36% 0.04 194);
}

.error {
  max-width: 20rem;
  margin: 0.75rem 0 0;
  color: oklch(55% 0.17 25);
  font-size: 0.75rem;
  text-align: center;
}

footer {
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  color: oklch(56% 0.02 215);
  font-size: 0.7rem;
}

@media (max-width: 46rem) {
  .stage {
    grid-template-columns: 1fr;
    align-content: center;
    gap: 2.5rem;
    padding-block: 3.5rem;
  }

  h1 {
    font-size: clamp(2.6rem, 15vw, 4.5rem);
  }

  .instrument {
    min-height: 15rem;
  }
}

@media (prefers-color-scheme: dark) {
  :root {
    color: oklch(92% 0.012 205);
    background: oklch(19% 0.018 215);
  }

  label,
  .copy > p:last-child,
  .backend-status,
  footer {
    color: oklch(72% 0.024 205);
  }

  select,
  kbd,
  .instrument {
    border-color: oklch(40% 0.024 210);
    background: oklch(25% 0.018 215);
    color: oklch(92% 0.012 205);
  }

  .backend-status strong {
    color: oklch(78% 0.1 194);
  }
}
</style>


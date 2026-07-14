<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import {
  capitalize,
  comparisonText,
  rangeText,
  summaryText,
  type AnalyticsWindow,
  type WaveCounterTransport,
} from '@waves-counter/client'

import AnalyticsChart from './AnalyticsChart.vue'
import CoffeeIcon from './CoffeeIcon.vue'
import { useWaveCounter } from './useWaveCounter.js'

type WaveCounterTheme = 'auto' | 'light' | 'dark'

const props = withDefaults(
  defineProps<{
    counterKey: string
    endpoint: string
    theme?: WaveCounterTheme
    icon?: Component
    showStats?: boolean
    analyticsWindow?: AnalyticsWindow
    longPressMs?: number
    transport?: WaveCounterTransport
  }>(),
  {
    theme: 'auto',
    icon: () => CoffeeIcon,
    showStats: true,
    longPressMs: 550,
  },
)

const emit = defineEmits<{
  error: [error: Error]
}>()

const analyticsWindows: { label: string; window: AnalyticsWindow }[] = [
  { label: '7D', window: '7d' },
  { label: '1M', window: '1M' },
  { label: 'All', window: 'all' },
]

const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const popover = ref<HTMLElement | null>(null)
const openSource = ref<'pointer' | 'keyboard'>('pointer')
const animateChart = ref(false)
const popoverStyle = ref<Record<string, string>>({})
const wave = useWaveCounter({
  counterKey: props.counterKey,
  endpoint: props.endpoint,
  showStats: props.showStats,
  ...(props.analyticsWindow ? { analyticsWindow: props.analyticsWindow } : {}),
  ...(props.transport ? { transport: props.transport } : {}),
})
let longPressTimer: ReturnType<typeof setTimeout> | undefined
let pointerStart: { x: number; y: number } | undefined
let capturedPointerId: number | undefined
let longPressActivated = false

const total = computed(() => wave.counter.value?.total)
const unavailable = computed(() => !wave.loading.value && wave.counter.value === null)
const title = computed(() => `${capitalize(props.counterKey)} statistics`)
const triggerLabel = computed(() => {
  const count = total.value === undefined ? 'unavailable' : `${total.value} total`
  const statsHint = wave.statsEnabled.value
    ? ' Right click, long press, or use the context menu key for statistics.'
    : ''
  return `Add one ${props.counterKey}. ${count}.${statsHint}`
})
const comparison = computed(() => comparisonText(wave.analytics.value, wave.analyticsWindow.value))
const dateRange = computed(() => rangeText(wave.analytics.value, wave.analyticsWindow.value))
const accessibleSummary = computed(() => summaryText(wave.analytics.value, wave.analyticsWindow.value))

watch(
  () => props.showStats,
  (enabled) => wave.enableStats(enabled),
)

onMounted(() => {
  document.addEventListener('pointerdown', handleOutsidePointer)
  window.addEventListener('resize', updatePopoverPosition)
  void wave.load().catch(emitError)
})

onBeforeUnmount(() => {
  cancelLongPress()
  document.removeEventListener('pointerdown', handleOutsidePointer)
  window.removeEventListener('resize', updatePopoverPosition)
})

async function increment(): Promise<void> {
  if (longPressActivated) {
    longPressActivated = false
    return
  }
  try {
    await wave.increment()
  } catch (error) {
    emitError(error)
  }
}

async function openStats(source: 'pointer' | 'keyboard'): Promise<void> {
  if (!wave.statsEnabled.value) return
  openSource.value = source
  animateChart.value = source === 'pointer'
  const opening = wave.openStats()
  await nextTick()
  updatePopoverPosition()
  try {
    await opening
    await nextTick()
    updatePopoverPosition()
  } catch {
    // Analytics errors stay inside the popover and retry in place.
  }
}

function handleContextMenu(event: MouseEvent): void {
  if (!wave.statsEnabled.value) return
  event.preventDefault()
  void openStats('pointer')
}

function handleTriggerKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape' && wave.statsOpen.value) {
    event.preventDefault()
    closeAndRestoreFocus()
    return
  }
  if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
    if (!wave.statsEnabled.value) return
    event.preventDefault()
    void openStats('keyboard')
  }
}

function handlePopoverKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  event.preventDefault()
  closeAndRestoreFocus()
}

function closeAndRestoreFocus(): void {
  wave.closeStats()
  animateChart.value = false
  trigger.value?.focus({ preventScroll: true })
}

function handleOutsidePointer(event: PointerEvent): void {
  if (!wave.statsOpen.value || root.value?.contains(event.target as Node)) return
  wave.closeStats()
  animateChart.value = false
}

function handlePointerDown(event: PointerEvent): void {
  if (event.pointerType !== 'touch' || !wave.statsEnabled.value) return
  cancelLongPress()
  pointerStart = { x: event.clientX, y: event.clientY }
  capturedPointerId = event.pointerId
  event.currentTarget instanceof HTMLButtonElement &&
    event.currentTarget.setPointerCapture?.(event.pointerId)
  longPressActivated = false
  longPressTimer = setTimeout(() => {
    longPressActivated = true
    void openStats('pointer')
  }, props.longPressMs)
}

function handlePointerMove(event: PointerEvent): void {
  if (!pointerStart || event.pointerType !== 'touch') return
  const distance = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  if (distance > 10) cancelLongPress()
}

function cancelLongPress(): void {
  if (longPressTimer !== undefined) clearTimeout(longPressTimer)
  longPressTimer = undefined
  pointerStart = undefined
  if (capturedPointerId !== undefined) {
    try {
      trigger.value?.releasePointerCapture?.(capturedPointerId)
    } catch {
      // Capture may already have ended after pointerup or pointercancel.
    }
  }
  capturedPointerId = undefined
}

function updatePopoverPosition(): void {
  if (!wave.statsOpen.value || !trigger.value || !popover.value) return
  const triggerRect = trigger.value.getBoundingClientRect()
  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const gutter = rootFontSize
  const measuredWidth = popover.value.getBoundingClientRect().width
  const width =
    measuredWidth > 0
      ? measuredWidth
      : Math.min(20 * rootFontSize, Math.max(0, window.innerWidth - gutter * 2))
  const centeredLeft = triggerRect.left + triggerRect.width / 2 - width / 2
  const clampedLeft = Math.min(
    Math.max(gutter, centeredLeft),
    Math.max(gutter, window.innerWidth - width - gutter),
  )
  popoverStyle.value = {
    '--wave-popover-offset-x': `${clampedLeft - centeredLeft}px`,
  }
}

function emitError(error: unknown): void {
  emit('error', error instanceof Error ? error : new Error(String(error)))
}

async function retryAnalytics(): Promise<void> {
  try {
    await wave.loadAnalytics()
  } catch {
    // The renewed error remains visible in the popover.
  }
}

async function selectAnalyticsWindow(window: AnalyticsWindow): Promise<void> {
  try {
    await wave.setAnalyticsWindow(window)
    await nextTick()
    updatePopoverPosition()
  } catch {
    // The renewed error remains visible in the popover.
  }
}

</script>

<template>
  <span
    ref="root"
    class="wave-counter"
    :data-open-source="openSource"
    :data-stats-open="wave.statsOpen.value || undefined"
    :data-theme="theme"
  >
    <button
      ref="trigger"
      class="wave-counter__trigger"
      type="button"
      :aria-label="triggerLabel"
      :aria-haspopup="wave.statsEnabled.value ? 'dialog' : undefined"
      :aria-expanded="wave.statsEnabled.value ? wave.statsOpen.value : undefined"
      :aria-controls="wave.statsOpen.value ? `${counterKey}-wave-stats` : undefined"
      :aria-busy="wave.pendingIncrements.value > 0 || undefined"
      @click="increment"
      @contextmenu="handleContextMenu"
      @keydown="handleTriggerKeydown"
      @pointerdown="handlePointerDown"
      @pointermove="handlePointerMove"
      @pointerup="cancelLongPress"
      @pointercancel="cancelLongPress"
    >
      <span class="wave-counter__icon" aria-hidden="true">
        <slot name="icon">
          <component :is="icon" :size="18" :stroke-width="1.8" />
        </slot>
      </span>
      <slot :total="total ?? 0" :pending="wave.pendingIncrements.value" :unavailable="unavailable">
        <span data-total class="wave-counter__total">{{ total ?? '—' }}</span>
      </slot>
      <span v-if="unavailable" class="wave-counter__sr-only" role="status">Counter unavailable</span>
    </button>

    <Transition name="wave-popover">
      <section
        v-if="wave.statsOpen.value"
        ref="popover"
        :id="`${counterKey}-wave-stats`"
        class="wave-counter__popover"
        :style="popoverStyle"
        role="dialog"
        :aria-label="title"
        tabindex="-1"
        @keydown="handlePopoverKeydown"
      >
        <slot
          name="analytics"
          :analytics="wave.analytics.value"
          :window="wave.analyticsWindow.value"
          :loading="wave.analyticsLoading.value"
          :error="wave.analyticsError.value"
          :set-window="selectAnalyticsWindow"
          :retry="retryAnalytics"
        >
          <div class="wave-counter__heading">
            <div>
              <p class="wave-counter__eyebrow">Activity</p>
              <h2>{{ capitalize(counterKey) }}</h2>
            </div>
            <div class="wave-counter__heading-actions">
              <div class="wave-counter__window-switch" aria-label="Activity range">
                <button
                  v-for="option in analyticsWindows"
                  :key="option.window"
                  type="button"
                  :aria-label="option.label"
                  :aria-pressed="wave.analyticsWindow.value === option.window"
                  @click="selectAnalyticsWindow(option.window)"
                >
                  {{ option.label }}
                </button>
              </div>
              <button class="wave-counter__close" type="button" aria-label="Close statistics" @click="closeAndRestoreFocus">
                <span aria-hidden="true">×</span>
              </button>
            </div>
          </div>

          <div v-if="wave.analyticsLoading.value" class="wave-counter__loading" role="status">
            Loading activity
          </div>
          <div v-else-if="wave.analyticsError.value" class="wave-counter__error" role="alert">
            <p>Activity is unavailable.</p>
            <button type="button" @click="retryAnalytics">Try again</button>
          </div>
          <div v-else-if="wave.analytics.value" class="wave-counter__analytics">
            <div class="wave-counter__summary-row">
              <strong>{{ wave.analytics.value.total }}</strong>
              <span>events</span>
            </div>
            <p data-comparison class="wave-counter__comparison">{{ comparison }}</p>
            <AnalyticsChart
              :analytics="wave.analytics.value"
              :animate="animateChart"
            />
            <p class="wave-counter__range">{{ dateRange }}</p>
            <p data-accessible-summary class="wave-counter__sr-only">
              {{ accessibleSummary }}
            </p>
          </div>
        </slot>
      </section>
    </Transition>
  </span>
</template>

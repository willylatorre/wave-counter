<script setup lang="ts">
import { computed } from 'vue'

import type { Analytics } from '@waves-counter/client'

const props = withDefaults(
  defineProps<{
    analytics: Analytics
    animate?: boolean
  }>(),
  { animate: true },
)

const width = 240
const height = 88
const inset = 8
const maximum = computed(() => Math.max(1, ...props.analytics.points.map((point) => point.count)))
const coordinates = computed(() =>
  props.analytics.points.map((point, index, points) => {
    const availableWidth = width - inset * 2
    const x = inset + (index / Math.max(1, points.length - 1)) * availableWidth
    const y = height - inset - (point.count / maximum.value) * (height - inset * 2)
    return { x, y, count: point.count }
  }),
)
const polyline = computed(() => coordinates.value.map(({ x, y }) => `${x},${y}`).join(' '))
</script>

<template>
  <svg
    class="wave-chart"
    :data-animate="animate || undefined"
    viewBox="0 0 240 88"
    preserveAspectRatio="none"
    :aria-hidden="'true'"
    focusable="false"
  >
    <line class="wave-chart__baseline" x1="8" y1="80" x2="232" y2="80" />
    <polyline class="wave-chart__line" :points="polyline" pathLength="1" />
    <circle
      v-for="point in coordinates"
      :key="`${point.x}-${point.y}`"
      class="wave-chart__point"
      :cx="point.x"
      :cy="point.y"
      r="2.5"
    />
  </svg>
</template>

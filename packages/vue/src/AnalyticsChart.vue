<script setup lang="ts">
import { computed } from 'vue'

import { analyticsChartPaths, analyticsChartPoints, type Analytics } from '@waves-counter/client'

const props = withDefaults(
  defineProps<{
    analytics: Analytics
    animate?: boolean
  }>(),
  { animate: true },
)

const coordinates = computed(() => analyticsChartPoints(props.analytics))
const paths = computed(() => analyticsChartPaths(coordinates.value))
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
    <defs>
      <linearGradient id="wave-chart-gradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--wave-accent)" stop-opacity="0.22" />
        <stop offset="100%" stop-color="var(--wave-accent)" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path class="wave-chart__area" :d="paths.area" />
    <line class="wave-chart__baseline" x1="8" y1="80" x2="232" y2="80" />
    <path class="wave-chart__line" :d="paths.line" pathLength="1" />
  </svg>
</template>

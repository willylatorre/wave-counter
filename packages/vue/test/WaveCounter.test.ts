import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { afterEach, expect, test, vi } from 'vitest'

import type { Analytics, CounterSnapshot, WaveCounterTransport } from '@wave-counter/client'

import WaveCounter from '../src/WaveCounter.vue'

const zero: CounterSnapshot = { key: 'coffee', total: 0, updatedAt: null }
const analytics: Analytics = {
  key: 'coffee',
  window: '7d',
  interval: 'day',
  timezone: 'UTC',
  total: 6,
  previousTotal: 3,
  changePercentage: 100,
  points: Array.from({ length: 7 }, (_, index) => ({
    start: `2026-07-${String(index + 4).padStart(2, '0')}T00:00:00Z`,
    count: index,
  })),
}

function transport(overrides: Partial<WaveCounterTransport> = {}): WaveCounterTransport {
  return {
    getCounter: vi.fn().mockResolvedValue(zero),
    increment: vi.fn().mockResolvedValue({ ...zero, total: 1 }),
    getAnalytics: vi.fn().mockResolvedValue(analytics),
    ...overrides,
  }
}

function mountCounter(counterTransport = transport(), props: Record<string, unknown> = {}, slots = {}) {
  return mount(WaveCounter, {
    attachTo: document.body,
    props: {
      counterKey: 'coffee',
      endpoint: '/api/waves',
      transport: counterTransport,
      ...props,
    },
    slots,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

test('loads on mount and reconciles an optimistic click', async () => {
  let resolveIncrement!: (value: CounterSnapshot) => void
  const increment = vi.fn().mockReturnValue(
    new Promise<CounterSnapshot>((resolve) => {
      resolveIncrement = resolve
    }),
  )
  const wrapper = mountCounter(transport({ increment }))
  await flushPromises()

  await wrapper.get('button').trigger('click')
  expect(wrapper.get('[data-total]').text()).toBe('1')
  expect(wrapper.get('button').attributes('aria-busy')).toBe('true')

  resolveIncrement({ ...zero, total: 7, updatedAt: '2026-07-10T13:42:00Z' })
  await flushPromises()
  expect(wrapper.get('[data-total]').text()).toBe('7')
  expect(wrapper.get('button').attributes('aria-busy')).toBeUndefined()
})

test('rolls back and emits an error when incrementing fails', async () => {
  const failure = new Error('offline')
  const wrapper = mountCounter(transport({ increment: vi.fn().mockRejectedValue(failure) }))
  await flushPromises()

  await wrapper.get('button').trigger('click')
  await flushPromises()

  expect(wrapper.get('[data-total]').text()).toBe('0')
  expect(wrapper.emitted('error')?.[0]).toEqual([failure])
})

test('opens analytics by context menu and restores focus on Escape', async () => {
  const counterTransport = transport()
  const wrapper = mountCounter(counterTransport)
  await flushPromises()
  const button = wrapper.get('button')

  await button.trigger('contextmenu')
  await flushPromises()
  expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('Coffee statistics')
  expect(counterTransport.getAnalytics).toHaveBeenCalledOnce()

  await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(button.element)
})

test('supports ContextMenu and Shift+F10 without popover motion', async () => {
  const wrapper = mountCounter()
  await flushPromises()
  const button = wrapper.get('button')

  await button.trigger('keydown', { key: 'ContextMenu' })
  await flushPromises()
  expect(wrapper.attributes('data-open-source')).toBe('keyboard')

  await button.trigger('keydown', { key: 'Escape' })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(document.activeElement).toBe(button.element)
  await button.trigger('keydown', { key: 'F10', shiftKey: true })
  await flushPromises()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
})

test('opens after deliberate long press and cancels when touch moves', async () => {
  vi.useFakeTimers()
  const wrapper = mountCounter()
  await flushPromises()
  const button = wrapper.get('button')
  const setPointerCapture = vi.fn()
  const releasePointerCapture = vi.fn()
  Object.assign(button.element, { setPointerCapture, releasePointerCapture })

  await button.trigger('pointerdown', { pointerId: 3, pointerType: 'touch', clientX: 4, clientY: 4 })
  expect(setPointerCapture).toHaveBeenCalledWith(3)
  await button.trigger('pointermove', { pointerType: 'touch', clientX: 20, clientY: 4 })
  await vi.advanceTimersByTimeAsync(600)
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(releasePointerCapture).toHaveBeenCalledWith(3)

  await button.trigger('pointerdown', { pointerId: 4, pointerType: 'touch', clientX: 4, clientY: 4 })
  await vi.advanceTimersByTimeAsync(600)
  await flushPromises()
  expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
})

test('draws the analytics line once on each pointer opening', async () => {
  const wrapper = mountCounter()
  await flushPromises()
  const button = wrapper.get('button')

  await button.trigger('contextmenu')
  await flushPromises()
  expect(wrapper.get('.wave-chart').attributes('data-animate')).toBe('true')
  await wrapper.get('.wave-counter__close').trigger('click')
  await button.trigger('contextmenu')
  await flushPromises()

  expect(wrapper.get('.wave-chart').attributes('data-animate')).toBe('true')
})

test('clamps the popover horizontally inside the viewport', async () => {
  const wrapper = mountCounter()
  await flushPromises()
  const button = wrapper.get('button')
  vi.spyOn(button.element, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 10,
    left: 0,
    right: 48,
    top: 10,
    bottom: 54,
    width: 48,
    height: 44,
    toJSON: () => ({}),
  })

  await button.trigger('contextmenu')
  await flushPromises()

  expect(wrapper.get('[role="dialog"]').attributes('style')).toContain('--wave-popover-offset-x:')
})

test('positions the loading popover before analytics resolves', async () => {
  const getAnalytics = vi.fn().mockReturnValue(new Promise<Analytics>(() => {}))
  const wrapper = mountCounter(transport({ getAnalytics }))
  await flushPromises()
  const opening = wrapper.get('button').trigger('contextmenu')
  await wrapper.vm.$nextTick()
  await wrapper.vm.$nextTick()

  expect(wrapper.get('[role="dialog"]').attributes('style')).toContain('--wave-popover-offset-x:')
  void opening
})

test('restores normal context menus and closes when stats are disabled', async () => {
  const counterTransport = transport()
  const wrapper = mountCounter(counterTransport)
  await flushPromises()
  const button = wrapper.get('button')
  await button.trigger('contextmenu')
  await flushPromises()

  await wrapper.setProps({ showStats: false })
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

  const contextMenu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  button.element.dispatchEvent(contextMenu)
  expect(contextMenu.defaultPrevented).toBe(false)
  expect(counterTransport.getAnalytics).toHaveBeenCalledOnce()
})

test('supports icon, button, and analytics slots', async () => {
  const Icon = defineComponent(() => () => h('span', { 'data-custom-icon': '' }, 'I'))
  const wrapper = mountCounter(
    transport(),
    {},
    {
      icon: () => h(Icon),
      default: ({ total }: { total: number }) => h('span', { 'data-custom-button': '' }, total),
      analytics: () => h('p', { 'data-custom-analytics': '' }, 'Custom stats'),
    },
  )
  await flushPromises()
  await wrapper.get('button').trigger('contextmenu')
  await flushPromises()

  expect(wrapper.find('[data-custom-icon]').exists()).toBe(true)
  expect(wrapper.find('[data-custom-button]').exists()).toBe(true)
  expect(wrapper.find('[data-custom-analytics]').exists()).toBe(true)
})

test('renders the lightweight default coffee icon', async () => {
  const wrapper = mountCounter()
  await flushPromises()

  expect(wrapper.get('[data-wave-coffee-icon]').element.tagName).toBe('svg')
})

test('duplicates chart information as text and hides the SVG from assistive technology', async () => {
  const wrapper = mountCounter()
  await flushPromises()
  await wrapper.get('button').trigger('contextmenu')
  await flushPromises()

  expect(wrapper.get('[data-accessible-summary]').text()).toContain('6 events')
  expect(wrapper.get('.wave-chart').attributes('aria-hidden')).toBe('true')
  expect(wrapper.get('[data-comparison]').text()).toContain('100%')
})

test('defines reduced-motion, reduced-transparency, contrast, and fine-pointer rules', async () => {
  const styles = await readFile(resolve(process.cwd(), 'src/styles.css'), 'utf8')

  expect(styles).toContain('@media (prefers-reduced-motion: reduce)')
  expect(styles).toContain('@media (prefers-reduced-transparency: reduce)')
  expect(styles).toContain('@media (prefers-contrast: more)')
  expect(styles).toContain('@media (hover: hover) and (pointer: fine)')
  expect(styles).toContain('--wave-counter-press-duration')
  expect(styles).toContain('--wave-counter-popover-duration')
  expect(styles).toContain('--wave-counter-active-duration')
  expect(styles).toContain('--wave-counter-motion-easing')
  expect(styles).toContain('box-sizing: border-box')
  expect(styles).toContain('left: 50%')
  expect(styles).toContain('--wave-popover-offset-x')
  expect(styles).not.toContain('transition: all')
})

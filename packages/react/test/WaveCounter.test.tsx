import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'

import type { Analytics, CounterSnapshot, WaveCounterTransport } from '@waves-counter/client'

import { WaveCounter } from '../src/index.js'

const zero: CounterSnapshot = { key: 'coffee', total: 0, updatedAt: null }
const analytics: Analytics = {
  key: 'coffee', window: '7d', interval: 'day', timezone: 'UTC', total: 6,
  previousTotal: 3, changePercentage: 100,
  points: Array.from({ length: 7 }, (_, index) => ({
    start: `2026-07-${String(index + 4).padStart(2, '0')}T00:00:00Z`, count: index,
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

function renderCounter(counterTransport = transport(), props = {}) {
  return render(<WaveCounter counterKey="coffee" endpoint="/api/waves" transport={counterTransport} {...props} />)
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.useRealTimers()
})

test('loads and reconciles an optimistic increment', async () => {
  let resolveIncrement!: (value: CounterSnapshot) => void
  const increment = vi.fn().mockReturnValue(new Promise<CounterSnapshot>((resolve) => { resolveIncrement = resolve }))
  renderCounter(transport({ increment }))
  const button = await screen.findByRole('button')

  fireEvent.click(button)
  expect(screen.getByTestId('total').textContent).toBe('1')
  expect(button.getAttribute('aria-busy')).toBe('true')

  await act(() => resolveIncrement({ ...zero, total: 7, updatedAt: null }))
  expect(screen.getByTestId('total').textContent).toBe('7')
})

test('rolls back failed increments and calls onError', async () => {
  const failure = new Error('offline')
  const onError = vi.fn()
  renderCounter(transport({ increment: vi.fn().mockRejectedValue(failure) }), { onError })
  fireEvent.click(await screen.findByRole('button'))

  await waitFor(() => expect(onError).toHaveBeenCalledWith(failure))
  expect(screen.getByTestId('total').textContent).toBe('0')
})

test('opens analytics with context menu and restores focus on Escape', async () => {
  renderCounter()
  const trigger = await screen.findByRole('button')
  fireEvent.contextMenu(trigger)
  expect(await screen.findByRole('dialog', { name: 'Coffee statistics' })).not.toBeNull()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  await new Promise((resolve) => setTimeout(resolve, 170))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(trigger)
})

test('supports ContextMenu and Shift+F10 keyboard openings', async () => {
  renderCounter()
  const trigger = await screen.findByRole('button')
  fireEvent.keyDown(trigger, { key: 'ContextMenu' })
  expect(screen.getByRole('dialog')).not.toBeNull()
  expect(trigger.parentElement?.getAttribute('data-open-source')).toBe('keyboard')
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true })
  expect(screen.getByRole('dialog')).not.toBeNull()
})

test('opens after touch long press and cancels after movement over 10px', async () => {
  vi.useFakeTimers()
  renderCounter()
  const trigger = screen.getByRole('button')
  Object.assign(trigger, { setPointerCapture: vi.fn(), releasePointerCapture: vi.fn() })
  const pointer = (x: number, y: number) => {
    const event = new Event('pointerdown', { bubbles: true })
    Object.defineProperties(event, { pointerType: { value: 'touch' }, pointerId: { value: 1 }, clientX: { value: x }, clientY: { value: y } })
    trigger.dispatchEvent(event)
  }
  pointer(4, 4)
  const move = new Event('pointermove', { bubbles: true })
  Object.defineProperties(move, { pointerType: { value: 'touch' }, clientX: { value: 15 }, clientY: { value: 4 } })
  trigger.dispatchEvent(move)
  await act(() => vi.advanceTimersByTimeAsync(600))
  expect(screen.queryByRole('dialog')).toBeNull()
  pointer(4, 4)
  await act(() => vi.advanceTimersByTimeAsync(600))
  expect(screen.getByRole('dialog')).not.toBeNull()
})

test('dismisses an open popover from an outside pointer', async () => {
  renderCounter()
  fireEvent.contextMenu(await screen.findByRole('button'))
  expect(await screen.findByRole('dialog')).not.toBeNull()
  fireEvent.pointerDown(document.body)
  expect(screen.getByRole('dialog')).not.toBeNull()
})

test('retries analytics in place after an error', async () => {
  const getAnalytics = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(analytics)
  renderCounter(transport({ getAnalytics }))
  fireEvent.contextMenu(await screen.findByRole('button'))
  expect((await screen.findByRole('alert')).textContent).toContain('Activity is unavailable')
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
  expect((await screen.findByTestId('accessible-summary')).textContent).toContain('6 events')
})

test('disables stats interactions when showStats is false', async () => {
  renderCounter(transport(), { showStats: false })
  const trigger = await screen.findByRole('button')
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  trigger.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(trigger.hasAttribute('aria-haspopup')).toBe(false)
})

test('sets the requested theme and supports render props', async () => {
  renderCounter(transport(), {
    theme: 'dark' as const,
    renderIcon: () => <span data-testid="custom-icon">I</span>,
    children: ({ total }: { total: number }) => <span data-testid="custom-button">{total}</span>,
    renderAnalytics: () => <p data-testid="custom-analytics">Custom stats</p>,
  })
  expect((await screen.findByRole('button')).parentElement?.getAttribute('data-theme')).toBe('dark')
  expect(screen.getByTestId('custom-icon')).not.toBeNull()
  expect(screen.getByTestId('custom-button').textContent).toBe('0')
  fireEvent.contextMenu(screen.getByRole('button'))
  expect(await screen.findByTestId('custom-analytics')).not.toBeNull()
})

test('renders the default coffee icon, accessible summary, and hidden chart', async () => {
  renderCounter()
  const total = await screen.findByTestId('total')
  expect(total.parentElement?.querySelector('[data-wave-coffee-icon]')?.tagName).toBe('svg')
  fireEvent.contextMenu(screen.getByRole('button'))
  expect((await screen.findByTestId('accessible-summary')).textContent).toContain('6 events')
  expect(screen.getByTestId('analytics-chart').getAttribute('aria-hidden')).toBe('true')
  expect(screen.getByTestId('comparison').textContent).toContain('100%')
})

test('clamps popover position and ships the Vue-equivalent stylesheet rules', async () => {
  renderCounter()
  const trigger = await screen.findByRole('button')
  vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 10, left: 0, right: 48, top: 10, bottom: 54, width: 48, height: 44, toJSON: () => ({}) })
  fireEvent.contextMenu(trigger)
  expect((await screen.findByRole('dialog')).getAttribute('style')).toContain('--wave-popover-offset-x:')
  const styles = await readFile(resolve(process.cwd(), 'src/styles.css'), 'utf8')
  for (const selector of [".wave-counter[data-theme='light']", "@media (prefers-reduced-motion: reduce)", '@media (prefers-reduced-transparency: reduce)', '@media (prefers-contrast: more)', '@media (hover: hover) and (pointer: fine)', '--wave-popover-offset-x']) expect(styles).toContain(selector)
})

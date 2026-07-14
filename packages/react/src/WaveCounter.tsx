import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Analytics, WaveCounterTransport } from '@waves-counter/client'

import { AnalyticsChart } from './AnalyticsChart.js'
import { CoffeeIcon } from './CoffeeIcon.js'
import { useWaveCounter } from './useWaveCounter.js'

export interface WaveCounterProps {
  counterKey: string; endpoint: string; theme?: 'auto' | 'light' | 'dark'; icon?: ReactNode | (() => ReactNode)
  showStats?: boolean; longPressMs?: number; transport?: WaveCounterTransport; onError?: (error: Error) => void
  children?: (state: { total: number; pending: number; unavailable: boolean }) => ReactNode
  renderIcon?: () => ReactNode
  renderAnalytics?: (state: { analytics: Analytics | null; loading: boolean; error: Error | null; retry: () => Promise<void> }) => ReactNode
}

export function WaveCounter({ counterKey, endpoint, theme = 'auto', icon, showStats = true, longPressMs = 550, transport, onError, children, renderIcon, renderAnalytics }: WaveCounterProps): React.JSX.Element {
  const root = useRef<HTMLSpanElement>(null); const trigger = useRef<HTMLButtonElement>(null); const popover = useRef<HTMLElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined); const origin = useRef<{ x: number; y: number } | undefined>(undefined); const pointerId = useRef<number | undefined>(undefined); const longPressActivated = useRef(false)
  const [openSource, setOpenSource] = useState<'pointer' | 'keyboard'>('pointer'); const [animateChart, setAnimateChart] = useState(false); const [mounted, setMounted] = useState(false); const [leaving, setLeaving] = useState(false); const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})
  const wave = useWaveCounter({ counterKey, endpoint, showStats, ...(transport ? { transport } : {}) })
  const total = wave.counter?.total; const unavailable = !wave.loading && wave.counter === null; const title = `${capitalize(counterKey)} statistics`
  const triggerLabel = `Add one ${counterKey}. ${total === undefined ? 'unavailable' : `${total} total`}.${wave.statsEnabled ? ' Right click, long press, or use the context menu key for statistics.' : ''}`
  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  const cancelLongPress = () => { if (timer.current) clearTimeout(timer.current); timer.current = undefined; origin.current = undefined; if (pointerId.current !== undefined) { try { trigger.current?.releasePointerCapture?.(pointerId.current) } catch {} } pointerId.current = undefined }
  const close = (restore = false) => { wave.closeStats(); setAnimateChart(false); if (reducedMotion() || openSource === 'keyboard') { setMounted(false) } else { setLeaving(true); window.setTimeout(() => { setLeaving(false); setMounted(false) }, 160) }; if (restore) trigger.current?.focus({ preventScroll: true }) }
  const updatePosition = () => { if (!trigger.current || !popover.current || !wave.statsOpen) return; const rect = trigger.current.getBoundingClientRect(); const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; const gutter = rootFont; const measured = popover.current.getBoundingClientRect().width; const width = measured > 0 ? measured : Math.min(20 * rootFont, Math.max(0, window.innerWidth - gutter * 2)); const centered = rect.left + rect.width / 2 - width / 2; const clamped = Math.min(Math.max(gutter, centered), Math.max(gutter, window.innerWidth - width - gutter)); setPopoverStyle({ '--wave-popover-offset-x': `${clamped - centered}px` } as CSSProperties) }
  const open = async (source: 'pointer' | 'keyboard') => { if (!wave.statsEnabled) return; setOpenSource(source); setAnimateChart(source === 'pointer'); setLeaving(false); setMounted(true); const opening = wave.openStats(); requestAnimationFrame(updatePosition); try { await opening } catch {} finally { requestAnimationFrame(updatePosition) } }
  useEffect(() => { void wave.load().catch((error: unknown) => onError?.(asError(error))) }, [counterKey, endpoint, transport, showStats])
  useEffect(() => { const outside = (event: PointerEvent) => { if (wave.statsOpen && !root.current?.contains(event.target as Node)) close() }; document.addEventListener('pointerdown', outside); window.addEventListener('resize', updatePosition); return () => { cancelLongPress(); document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', updatePosition) } }, [wave.statsOpen, openSource])
  useLayoutEffect(() => { if (mounted) updatePosition() }, [mounted, wave.statsOpen, wave.analyticsLoading])
  const retry = async () => { try { await wave.loadAnalytics() } catch {} }
  const onIncrement = async () => { if (longPressActivated.current) { longPressActivated.current = false; return }; try { await wave.increment() } catch (error) { onError?.(asError(error)) } }
  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => { if ((event.pointerType && event.pointerType !== 'touch') || !wave.statsEnabled) return; cancelLongPress(); origin.current = { x: event.clientX, y: event.clientY }; pointerId.current = event.pointerId; event.currentTarget.setPointerCapture?.(event.pointerId); longPressActivated.current = false; timer.current = setTimeout(() => { longPressActivated.current = true; void open('pointer') }, longPressMs) }
  const comparison = comparisonText(wave.analytics); const dateRange = rangeText(wave.analytics); const summary = summaryText(wave.analytics)
  const showPopover = mounted || wave.statsOpen || leaving
  return <span ref={root} className="wave-counter" data-open-source={openSource} data-stats-open={wave.statsOpen || undefined} data-theme={theme}>
    <button ref={trigger} className="wave-counter__trigger" type="button" aria-label={triggerLabel} aria-haspopup={wave.statsEnabled ? 'dialog' : undefined} aria-expanded={wave.statsEnabled ? wave.statsOpen : undefined} aria-controls={wave.statsOpen ? `${counterKey}-wave-stats` : undefined} aria-busy={wave.pendingIncrements > 0 || undefined} onClick={() => void onIncrement()} onContextMenu={(e) => { if (!wave.statsEnabled) return; e.preventDefault(); void open('pointer') }} onKeyDown={(e) => { if (e.key === 'Escape' && wave.statsOpen) { e.preventDefault(); close(true) } else if (e.key === 'ContextMenu' || (e.key === 'F10' && e.shiftKey)) { if (wave.statsEnabled) { e.preventDefault(); void open('keyboard') } } }} onPointerDown={onPointerDown} onPointerMove={(e) => { if (origin.current && (!e.pointerType || e.pointerType === 'touch') && Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) cancelLongPress() }} onPointerUp={cancelLongPress} onPointerCancel={cancelLongPress}>
      <span className="wave-counter__icon" aria-hidden="true">{renderIcon?.() ?? (typeof icon === 'function' ? icon() : icon) ?? <CoffeeIcon />}</span>
      {children?.({ total: total ?? 0, pending: wave.pendingIncrements, unavailable }) ?? <span data-testid="total" data-total="" className="wave-counter__total">{total ?? '—'}</span>}
      {unavailable && <span className="wave-counter__sr-only" role="status">Counter unavailable</span>}
    </button>
    {showPopover && <section ref={popover} id={`${counterKey}-wave-stats`} className={`wave-counter__popover ${leaving ? 'wave-popover-leave-active wave-popover-leave-to' : openSource === 'pointer' ? 'wave-popover-enter-active' : ''}`} style={popoverStyle} role="dialog" aria-label={title} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(true) } }}>
      {renderAnalytics?.({ analytics: wave.analytics, loading: wave.analyticsLoading, error: wave.analyticsError, retry }) ?? <><div className="wave-counter__heading"><div><p className="wave-counter__eyebrow">Seven day activity</p><h2>{capitalize(counterKey)}</h2></div><button className="wave-counter__close" type="button" aria-label="Close statistics" onClick={() => close(true)}><span aria-hidden="true">×</span></button></div>
        {wave.analyticsLoading ? <div className="wave-counter__loading" role="status">Loading activity</div> : wave.analyticsError ? <div className="wave-counter__error" role="alert"><p>Activity is unavailable.</p><button type="button" onClick={() => void retry()}>Try again</button></div> : wave.analytics && <div className="wave-counter__analytics"><div className="wave-counter__summary-row"><strong>{wave.analytics.total}</strong><span>events</span></div><p data-testid="comparison" data-comparison="" className="wave-counter__comparison">{comparison}</p><AnalyticsChart analytics={wave.analytics} animate={animateChart} /><p className="wave-counter__range">{dateRange}</p><p data-testid="accessible-summary" data-accessible-summary="" className="wave-counter__sr-only">{summary}</p></div>}</>}
    </section>}
  </span>
}

function asError(error: unknown): Error { return error instanceof Error ? error : new Error(String(error)) }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1) }
function comparisonText(analytics: Analytics | null): string { if (!analytics) return ''; if (analytics.previousTotal === 0) return analytics.total === 0 ? 'No events in this or the previous seven days' : `${analytics.total} events, with none in the previous seven days`; const change = analytics.changePercentage ?? 0; return `${Math.abs(change)}% ${change >= 0 ? 'more' : 'less'} than the previous seven days` }
function rangeText(analytics: Analytics | null): string { if (!analytics?.points.length) return 'Last seven UTC days'; const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); const first = analytics.points[0]; const last = analytics.points.at(-1); return first && last ? `${formatter.format(new Date(first.start))} to ${formatter.format(new Date(last.start))}, UTC` : 'Last seven UTC days' }
function summaryText(analytics: Analytics | null): string { return analytics ? `${analytics.total} events in the last seven days. Daily counts: ${analytics.points.map((point) => point.count).join(', ')}. ${comparisonText(analytics)}.` : '' }

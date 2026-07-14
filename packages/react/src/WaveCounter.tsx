import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import type { Analytics, WaveCounterTransport } from '@waves-counter/client'

import { AnalyticsChart } from './AnalyticsChart.js'
import { CoffeeIcon } from './CoffeeIcon.js'
import { useWaveCounter } from './useWaveCounter.js'

export type WaveCounterTheme = 'auto' | 'light' | 'dark'

export interface WaveCounterProps {
  counterKey: string
  endpoint: string
  theme?: WaveCounterTheme
  icon?: ReactNode | (() => ReactNode)
  showStats?: boolean
  longPressMs?: number
  transport?: WaveCounterTransport
  onError?: (error: Error) => void
  children?: (state: { total: number; pending: number; unavailable: boolean }) => ReactNode
  renderIcon?: () => ReactNode
  renderAnalytics?: (state: AnalyticsRenderState) => ReactNode
}

interface AnalyticsRenderState {
  analytics: Analytics | null
  loading: boolean
  error: Error | null
  retry: () => Promise<void>
}

type OpenSource = 'pointer' | 'keyboard'

const POPOVER_EXIT_MS = 160

export function WaveCounter({
  counterKey,
  endpoint,
  theme = 'auto',
  icon,
  showStats = true,
  longPressMs = 550,
  transport,
  onError,
  children,
  renderIcon,
  renderAnalytics,
}: WaveCounterProps): React.JSX.Element {
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const popover = useRef<HTMLElement>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pointerOrigin = useRef<{ x: number; y: number } | undefined>(undefined)
  const capturedPointerId = useRef<number | undefined>(undefined)
  const longPressActivated = useRef(false)
  const enterFrame = useRef<number | undefined>(undefined)

  const [openSource, setOpenSource] = useState<OpenSource>('pointer')
  const [animateChart, setAnimateChart] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [entering, setEntering] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({})

  const wave = useWaveCounter({
    counterKey,
    endpoint,
    showStats,
    ...(transport ? { transport } : {}),
  })
  const total = wave.counter?.total
  const unavailable = !wave.loading && wave.counter === null
  const title = `${capitalize(counterKey)} statistics`
  const triggerLabel = describeTrigger(counterKey, total, wave.statsEnabled)

  const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  const cancelLongPress = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = undefined
    pointerOrigin.current = undefined

    if (capturedPointerId.current !== undefined) {
      try {
        trigger.current?.releasePointerCapture?.(capturedPointerId.current)
      } catch {}
    }
    capturedPointerId.current = undefined
  }

  const cancelEnterFrame = () => {
    if (enterFrame.current !== undefined) cancelAnimationFrame(enterFrame.current)
    enterFrame.current = undefined
  }

  const updatePosition = () => {
    if (!trigger.current || !popover.current || !wave.statsOpen) return

    const triggerRect = trigger.current.getBoundingClientRect()
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const gutter = rootFontSize
    const measuredWidth = popover.current.getBoundingClientRect().width
    const popoverWidth = measuredWidth > 0
      ? measuredWidth
      : Math.min(20 * rootFontSize, Math.max(0, window.innerWidth - gutter * 2))
    const centeredLeft = triggerRect.left + triggerRect.width / 2 - popoverWidth / 2
    const clampedLeft = Math.min(
      Math.max(gutter, centeredLeft),
      Math.max(gutter, window.innerWidth - popoverWidth - gutter),
    )

    setPopoverStyle({
      '--wave-popover-offset-x': `${clampedLeft - centeredLeft}px`,
    } as CSSProperties)
  }

  const dismiss = (restoreFocus = false) => {
    wave.closeStats()
    setAnimateChart(false)
    cancelEnterFrame()
    setEntering(false)

    if (reducedMotion() || openSource === 'keyboard') {
      setLeaving(false)
      setMounted(false)
    } else {
      setLeaving(true)
      window.setTimeout(() => {
        setLeaving(false)
        setMounted(false)
      }, POPOVER_EXIT_MS)
    }

    if (restoreFocus) trigger.current?.focus({ preventScroll: true })
  }

  const open = async (source: OpenSource) => {
    if (!wave.statsEnabled) return

    const shouldAnimate = source === 'pointer' && !reducedMotion()
    setOpenSource(source)
    setAnimateChart(source === 'pointer')
    setLeaving(false)
    setMounted(true)
    setEntering(shouldAnimate)
    cancelEnterFrame()
    if (shouldAnimate) {
      enterFrame.current = requestAnimationFrame(() => {
        enterFrame.current = undefined
        setEntering(false)
        updatePosition()
      })
    }

    const opening = wave.openStats()
    requestAnimationFrame(updatePosition)
    try {
      await opening
    } catch {
      // The popover renders its analytics error and retry affordance.
    } finally {
      requestAnimationFrame(updatePosition)
    }
  }

  useEffect(() => {
    void wave.load().catch((error: unknown) => onError?.(asError(error)))
  }, [counterKey, endpoint, transport])

  useEffect(() => {
    if (wave.statsEnabled) return
    cancelEnterFrame()
    setEntering(false)
    setLeaving(false)
    setMounted(false)
  }, [wave.statsEnabled])

  useEffect(() => {
    const onOutsidePointer = (event: PointerEvent) => {
      if (wave.statsOpen && !root.current?.contains(event.target as Node)) dismiss()
    }

    document.addEventListener('pointerdown', onOutsidePointer)
    window.addEventListener('resize', updatePosition)
    return () => {
      cancelLongPress()
      cancelEnterFrame()
      document.removeEventListener('pointerdown', onOutsidePointer)
      window.removeEventListener('resize', updatePosition)
    }
  }, [wave.statsOpen, openSource])

  useLayoutEffect(() => {
    if (mounted) updatePosition()
  }, [mounted, wave.statsOpen, wave.analyticsLoading])

  const retry = async () => {
    try {
      await wave.loadAnalytics()
    } catch {
      // The controller retains the analytics error for the retry UI.
    }
  }

  const increment = async () => {
    if (longPressActivated.current) {
      longPressActivated.current = false
      return
    }

    try {
      await wave.increment()
    } catch (error) {
      onError?.(asError(error))
    }
  }

  const beginLongPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    if ((event.pointerType && event.pointerType !== 'touch') || !wave.statsEnabled) return

    cancelLongPress()
    pointerOrigin.current = { x: event.clientX, y: event.clientY }
    capturedPointerId.current = event.pointerId
    event.currentTarget.setPointerCapture?.(event.pointerId)
    longPressActivated.current = false
    longPressTimer.current = setTimeout(() => {
      longPressActivated.current = true
      void open('pointer')
    }, longPressMs)
  }

  const cancelMovedLongPress = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (
      pointerOrigin.current
      && (!event.pointerType || event.pointerType === 'touch')
      && Math.hypot(event.clientX - pointerOrigin.current.x, event.clientY - pointerOrigin.current.y) > 10
    ) {
      cancelLongPress()
    }
  }

  const comparison = comparisonText(wave.analytics)
  const dateRange = rangeText(wave.analytics)
  const summary = summaryText(wave.analytics)
  const showPopover = mounted || wave.statsOpen || leaving
  const popoverClasses = [
    'wave-counter__popover',
    leaving ? 'wave-popover-leave-active wave-popover-leave-to' : undefined,
    entering ? 'wave-popover-enter-active wave-popover-enter-from' : undefined,
    !entering && !leaving && openSource === 'pointer' ? 'wave-popover-enter-active' : undefined,
  ].filter(Boolean).join(' ')

  return (
    <span
      ref={root}
      className="wave-counter"
      data-open-source={openSource}
      data-stats-open={wave.statsOpen || undefined}
      data-theme={theme}
    >
      <button
        ref={trigger}
        className="wave-counter__trigger"
        type="button"
        aria-label={triggerLabel}
        aria-haspopup={wave.statsEnabled ? 'dialog' : undefined}
        aria-expanded={wave.statsEnabled ? wave.statsOpen : undefined}
        aria-controls={wave.statsOpen ? `${counterKey}-wave-stats` : undefined}
        aria-busy={wave.pendingIncrements > 0 || undefined}
        onClick={() => void increment()}
        onContextMenu={(event) => {
          if (!wave.statsEnabled) return
          event.preventDefault()
          void open('pointer')
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && wave.statsOpen) {
            event.preventDefault()
            dismiss(true)
          } else if (event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)) {
            if (wave.statsEnabled) {
              event.preventDefault()
              void open('keyboard')
            }
          }
        }}
        onPointerDown={beginLongPress}
        onPointerMove={cancelMovedLongPress}
        onPointerUp={cancelLongPress}
        onPointerCancel={cancelLongPress}
      >
        <span className="wave-counter__icon" aria-hidden="true">
          {renderIcon?.() ?? (typeof icon === 'function' ? icon() : icon) ?? <CoffeeIcon />}
        </span>
        {children?.({ total: total ?? 0, pending: wave.pendingIncrements, unavailable }) ?? (
          <span data-testid="total" data-total="" className="wave-counter__total">{total ?? '—'}</span>
        )}
        {unavailable && <span className="wave-counter__sr-only" role="status">Counter unavailable</span>}
      </button>

      {showPopover && (
        <section
          ref={popover}
          id={`${counterKey}-wave-stats`}
          className={popoverClasses}
          style={popoverStyle}
          role="dialog"
          aria-label={title}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              dismiss(true)
            }
          }}
        >
          {renderAnalytics?.({
            analytics: wave.analytics,
            loading: wave.analyticsLoading,
            error: wave.analyticsError,
            retry,
          }) ?? (
            <>
              <div className="wave-counter__heading">
                <div>
                  <p className="wave-counter__eyebrow">Seven day activity</p>
                  <h2>{capitalize(counterKey)}</h2>
                </div>
                <button className="wave-counter__close" type="button" aria-label="Close statistics" onClick={() => dismiss(true)}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              {wave.analyticsLoading ? (
                <div className="wave-counter__loading" role="status">Loading activity</div>
              ) : wave.analyticsError ? (
                <div className="wave-counter__error" role="alert">
                  <p>Activity is unavailable.</p>
                  <button type="button" onClick={() => void retry()}>Try again</button>
                </div>
              ) : wave.analytics ? (
                <div className="wave-counter__analytics">
                  <div className="wave-counter__summary-row"><strong>{wave.analytics.total}</strong><span>events</span></div>
                  <p data-testid="comparison" data-comparison="" className="wave-counter__comparison">{comparison}</p>
                  <AnalyticsChart analytics={wave.analytics} animate={animateChart} />
                  <p className="wave-counter__range">{dateRange}</p>
                  <p data-testid="accessible-summary" data-accessible-summary="" className="wave-counter__sr-only">{summary}</p>
                </div>
              ) : null}
            </>
          )}
        </section>
      )}
    </span>
  )
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function describeTrigger(counterKey: string, total: number | undefined, statsEnabled: boolean): string {
  const totalDescription = total === undefined ? 'unavailable' : `${total} total`
  const statsDescription = statsEnabled ? ' Right click, long press, or use the context menu key for statistics.' : ''
  return `Add one ${counterKey}. ${totalDescription}.${statsDescription}`
}

function comparisonText(analytics: Analytics | null): string {
  if (!analytics) return ''
  if (analytics.previousTotal === 0) {
    return analytics.total === 0
      ? 'No events in this or the previous seven days'
      : `${analytics.total} events, with none in the previous seven days`
  }
  const change = analytics.changePercentage ?? 0
  return `${Math.abs(change)}% ${change >= 0 ? 'more' : 'less'} than the previous seven days`
}

function rangeText(analytics: Analytics | null): string {
  if (!analytics?.points.length) return 'Last seven UTC days'
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const first = analytics.points[0]
  const last = analytics.points.at(-1)
  return first && last
    ? `${formatter.format(new Date(first.start))} to ${formatter.format(new Date(last.start))}, UTC`
    : 'Last seven UTC days'
}

function summaryText(analytics: Analytics | null): string {
  if (!analytics) return ''
  return `${analytics.total} events in the last seven days. Daily counts: ${analytics.points.map((point) => point.count).join(', ')}. ${comparisonText(analytics)}.`
}

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { RefreshCw } from 'lucide-react'

// Touch gestures for the installed PWA. iOS standalone mode has no browser
// back gesture or pull-to-refresh, so the app provides its own. Each gesture
// locks to one axis after a few pixels, so vertical scrolling stays native.
// DOM styles are written through refs: a gesture frame never re-renders React.

const LOCK = 8
const reduceMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const scrollTop = () => (document.scrollingElement ?? document.documentElement).scrollTop

/** Swipe right from the left edge to go back, like a native navigation stack. */
export function SwipeBack({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const backRef = useRef(onBack)
  backRef.current = onBack
  const enabled = Boolean(onBack)

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let startX = 0, startY = 0, startT = 0, dx = 0, mode: 'idle' | 'pending' | 'drag' = 'idle'
    const reset = (animate: boolean) => {
      el.style.transition = animate && !reduceMotion() ? 'transform 200ms cubic-bezier(.2,.8,.2,1)' : ''
      el.style.transform = ''
      el.classList.remove('swipe-back-active')
    }
    const start = (e: TouchEvent) => {
      const t = e.touches[0]
      if (e.touches.length !== 1 || t.clientX > 28) { mode = 'idle'; return }
      startX = t.clientX; startY = t.clientY; startT = performance.now(); dx = 0; mode = 'pending'
    }
    const move = (e: TouchEvent) => {
      if (mode === 'idle') return
      const t = e.touches[0]
      dx = t.clientX - startX
      const dy = t.clientY - startY
      if (mode === 'pending') {
        if (Math.abs(dy) > LOCK && Math.abs(dy) > Math.abs(dx)) { mode = 'idle'; return }
        if (dx < LOCK) return
        mode = 'drag'
        el.style.transition = ''
        el.classList.add('swipe-back-active')
      }
      e.preventDefault()
      el.style.transform = `translate3d(${Math.max(0, dx)}px,0,0)`
    }
    const end = () => {
      if (mode !== 'drag') { mode = 'idle'; return }
      mode = 'idle'
      const velocity = dx / Math.max(1, performance.now() - startT)
      if (dx > Math.min(120, window.innerWidth * 0.3) || (dx > 40 && velocity > 0.5)) {
        if (reduceMotion()) { reset(false); backRef.current?.(); return }
        el.style.transition = 'transform 160ms ease-out'
        el.style.transform = `translate3d(${window.innerWidth}px,0,0)`
        window.setTimeout(() => { backRef.current?.() }, 150)
      } else reset(true)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [enabled])

  return <div ref={ref} className="swipe-back-layer">{children}</div>
}

/** Pull down at the top of a tab to reload the couple's data from the server. */
export function PullToRefresh({ enabled, onRefresh, children }: { enabled: boolean; onRefresh: () => Promise<unknown>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const indicator = useRef<HTMLDivElement>(null)
  const refreshRef = useRef(onRefresh)
  refreshRef.current = onRefresh
  const [refreshing, setRefreshing] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    const el = ref.current, dot = indicator.current
    if (!el || !dot || !enabled) return
    const TRIGGER = 72
    let startX = 0, startY = 0, pull = 0, mode: 'idle' | 'pending' | 'drag' = 'idle'
    const paint = (distance: number, animate: boolean) => {
      dot.style.transition = animate ? 'transform 200ms ease, opacity 200ms ease' : ''
      dot.style.transform = `translate3d(-50%,${distance - 48}px,0) rotate(${distance * 3}deg)`
      dot.style.opacity = String(Math.min(1, distance / TRIGGER))
      dot.classList.toggle('ready', distance >= TRIGGER)
    }
    const start = (e: TouchEvent) => {
      if (busy.current || e.touches.length !== 1 || scrollTop() > 0) { mode = 'idle'; return }
      startX = e.touches[0].clientX; startY = e.touches[0].clientY; pull = 0; mode = 'pending'
    }
    const move = (e: TouchEvent) => {
      if (mode === 'idle') return
      const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY
      if (mode === 'pending') {
        if (dy < 0 || (Math.abs(dx) > LOCK && Math.abs(dx) > Math.abs(dy)) || scrollTop() > 0) { mode = 'idle'; return }
        if (dy < LOCK) return
        mode = 'drag'
      }
      e.preventDefault()
      pull = Math.min(110, Math.max(0, dy - LOCK) * 0.5)
      paint(pull, false)
    }
    const end = () => {
      if (mode !== 'drag') { mode = 'idle'; return }
      mode = 'idle'
      if (pull < TRIGGER) { paint(0, true); return }
      busy.current = true
      setRefreshing(true)
      paint(TRIGGER, true)
      void refreshRef.current().finally(() => {
        busy.current = false
        setRefreshing(false)
        paint(0, true)
      })
    }
    paint(0, false)
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [enabled])

  return <div ref={ref} className="ptr-layer">
    {enabled && <div ref={indicator} className={`ptr-indicator${refreshing ? ' spinning' : ''}`} aria-hidden="true"><RefreshCw size={18}/></div>}
    {refreshing && <span className="sr-only" role="status">Đang làm mới dữ liệu…</span>}
    {children}
  </div>
}

/** Swipe a row left to reveal one destructive action (delete / cancel). */
export function SwipeRow({ children, actionLabel, onAction, disabled = false, className = '' }: {
  children: ReactNode; actionLabel: string; onAction: () => void; disabled?: boolean; className?: string
}) {
  const content = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const moved = useRef(false)
  const WIDTH = 88

  useEffect(() => {
    const el = content.current
    if (!el || disabled) return
    let startX = 0, startY = 0, base = 0, x = 0, mode: 'idle' | 'pending' | 'drag' = 'idle'
    const set = (value: number, animate: boolean) => {
      el.style.transition = animate && !reduceMotion() ? 'transform 180ms cubic-bezier(.2,.8,.2,1)' : ''
      el.style.transform = value ? `translate3d(${value}px,0,0)` : ''
      el.parentElement?.classList.toggle('revealing', value !== 0)
    }
    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      startX = e.touches[0].clientX; startY = e.touches[0].clientY
      base = openRef.current ? -WIDTH : 0; x = base; mode = 'pending'; moved.current = false
    }
    const move = (e: TouchEvent) => {
      if (mode === 'idle') return
      const dx = e.touches[0].clientX - startX, dy = e.touches[0].clientY - startY
      if (mode === 'pending') {
        if (Math.abs(dy) > LOCK && Math.abs(dy) > Math.abs(dx)) { mode = 'idle'; return }
        if (Math.abs(dx) < LOCK) return
        mode = 'drag'; moved.current = true
      }
      e.preventDefault()
      x = Math.min(0, Math.max(-WIDTH * 1.3, base + dx))
      set(x, false)
    }
    const end = () => {
      if (mode !== 'drag') { mode = 'idle'; return }
      mode = 'idle'
      const next = x < -WIDTH / 2
      openRef.current = next; setOpen(next)
      set(next ? -WIDTH : 0, true)
    }
    el.addEventListener('touchstart', start, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', end)
    el.addEventListener('touchcancel', end)
    return () => {
      el.removeEventListener('touchstart', start)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', end)
      el.removeEventListener('touchcancel', end)
    }
  }, [disabled])

  const close = () => {
    openRef.current = false; setOpen(false)
    const el = content.current
    if (el) { el.style.transition = reduceMotion() ? '' : 'transform 180ms ease'; el.style.transform = ''; el.parentElement?.classList.remove('revealing') }
  }
  // A drag must not also count as a tap on the row; a tap on an open row closes it.
  const guardClick = (event: MouseEvent) => {
    if (moved.current || openRef.current) {
      event.preventDefault(); event.stopPropagation()
      moved.current = false
      if (openRef.current) close()
    }
  }

  return <div className={`swipe-row ${open ? 'open' : ''} ${className}`}>
    {!disabled && <button type="button" className="swipe-action" tabIndex={open ? 0 : -1} aria-hidden={!open}
      onClick={() => { close(); onAction() }}>{actionLabel}</button>}
    <div ref={content} className="swipe-content" onClickCapture={guardClick}>{children}</div>
  </div>
}

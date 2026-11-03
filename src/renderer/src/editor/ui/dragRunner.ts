import type { RefObject } from 'react'
import { clipEnd, type Project } from '../model'
import { useLaneLive } from './laneLive'
import type { SnapEnv } from './timelineDrags'
import { useEditor } from '../editor.store'
import { TL } from '../../config/timeline'
import { clamp, clampScroll, easeOut, layoutOf, type Layout } from './timelineMath'

// Shared view plumbing for every timeline input hook: pointer to time/lane maths, scroll + zoom (with glides),
// and one generic window-level pointer drag (threshold, edge autoscroll both axes, Escape cancels).
export type Pt = { cx: number; cy: number; x: number; y: number; t: number }
export type ViewRefs = { root: RefObject<HTMLDivElement | null>; lanes: RefObject<HTMLDivElement | null> }
export type DragOpts = { auto?: boolean; threshold?: number }

export const st = () => useEditor.getState()
export const envOf = (): SnapEnv => { const s = st(); return { enabled: s.snap, playhead: s.playhead, pxPerSec: s.pxPerSec, beats: s.beatSnap } }
export const layOf = (p: Project): Layout => layoutOf(p.tracks, useLaneLive.getState().live)
export const endOf = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

let glideRaf = 0
/** Any direct user scroll/zoom stops a running glide. */
export const cancelGlide = () => { if (glideRaf) cancelAnimationFrame(glideRaf); glideRaf = 0 }

/** Run an animation 0..1 over ms (instant when reduced motion is on). */
function glide(ms: number, frame: (k: number) => void) {
  cancelGlide()
  if (reduced() || ms <= 0) return frame(1)
  const t0 = performance.now()
  const tick = (now: number) => {
    const k = Math.min(1, (now - t0) / ms)
    frame(easeOut(k))
    glideRaf = k < 1 ? requestAnimationFrame(tick) : 0
  }
  glideRaf = requestAnimationFrame(tick)
}

export function makeView({ root, lanes }: ViewRefs) {
  const viewW = () => lanes.current?.clientWidth ?? 0
  const point = (cx: number, cy: number): Pt => {
    const el = lanes.current!, r = el.getBoundingClientRect(), s = st()
    const x = cx - r.left
    return { cx, cy, x, y: cy - r.top + el.scrollTop, t: (x + s.scrollX) / s.pxPerSec }
  }
  const clampX = (x: number) => { const s = st(); return clampScroll(x, s.project ? endOf(s.project) : 0, s.pxPerSec, viewW()) }
  const scrollTo = (x: number) => {
    const s = st(), v = clampX(x)
    if (Math.abs(v - s.scrollX) > 0.01) s.setScroll(v)
  }
  const glideScroll = (x: number, ms = TL.glideMs) => {
    const from = st().scrollX, to = clampX(x)
    if (Math.abs(to - from) < 1) return
    glide(ms, k => st().setScroll(from + (to - from) * k))
  }
  const zoomAt = (x: number, pps: number, animate = false, ms = TL.zoomGlideMs) => {
    const s = st(), next = clamp(pps, TL.minPps, TL.maxPps), anchor = (x + s.scrollX) / s.pxPerSec
    if (next === s.pxPerSec) return
    const settle = () => { const a = st(), v = clampX(a.scrollX); if (v !== a.scrollX) a.setScroll(v) }
    if (!animate) { s.setZoom(next, anchor); return settle() }
    const from = s.pxPerSec
    glide(ms, k => { st().setZoom(from * (next / from) ** k, anchor); if (k === 1) settle() })
  }
  /** Zoom so [t0, t1] fills the view (animated). */
  const zoomToRange = (t0: number, t1: number) => {
    const s = st(), w = viewW(), span = Math.max(t1 - t0, TL.miniMinViewSec)
    const pps = clamp((w - 24) / span, TL.minPps, TL.maxPps), from = s.pxPerSec, a0 = s.scrollX
    const target = Math.max(0, t0 * pps - 12)
    glide(TL.zoomGlideMs + 60, k => {
      const cur = from * (pps / from) ** k
      st().setZoom(cur, undefined)
      st().setScroll(a0 + (target - a0) * k)
    })
  }

  function runDrag(e: { clientX: number; clientY: number }, kind: string, o: DragOpts, step: (pt: Pt) => void, end: (moved: boolean, cancel: boolean) => void) {
    let moved = false, raf = 0, last = { cx: e.clientX, cy: e.clientY }
    const thr = o.threshold ?? TL.dragStartPx
    cancelGlide()
    root.current!.dataset.drag = kind
    const frame = () => {
      raf = 0
      const ln = lanes.current
      if (!ln) return
      const r = ln.getBoundingClientRect(), x = last.cx - r.left, y = last.cy - r.top, z = TL.autoScrollZonePx
      const vx = x < z ? -(z - x) / z : x > r.width - z ? (x - (r.width - z)) / z : 0
      const vy = y < z ? -(z - y) / z : y > r.height - z ? (y - (r.height - z)) / z : 0
      if (!vx && !vy) return
      if (vx) scrollTo(st().scrollX + clamp(vx, -1, 1) * TL.autoScrollMax)
      if (vy && ln.scrollHeight > ln.clientHeight) ln.scrollTop += clamp(vy, -1, 1) * TL.autoScrollY
      step(point(last.cx, last.cy))
      raf = requestAnimationFrame(frame)
    }
    const move = (ev: PointerEvent) => {
      last = { cx: ev.clientX, cy: ev.clientY }
      if (!moved && Math.hypot(last.cx - e.clientX, last.cy - e.clientY) < thr) return
      moved = true
      step(point(last.cx, last.cy))
      if (o.auto && !raf) raf = requestAnimationFrame(frame)
    }
    const finish = (cancel: boolean) => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancelUp); window.removeEventListener('keydown', key)
      if (raf) cancelAnimationFrame(raf)
      delete root.current?.dataset.drag
      end(moved, cancel)
    }
    const up = () => finish(false), cancelUp = () => finish(true)
    const key = (ev: KeyboardEvent) => { if (ev.key === 'Escape') finish(true) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancelUp); window.addEventListener('keydown', key)
  }

  return { viewW, point, scrollTo, glideScroll, zoomAt, zoomToRange, runDrag }
}
export type View = ReturnType<typeof makeView>

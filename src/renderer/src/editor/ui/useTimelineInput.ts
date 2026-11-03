import { useEffect, type PointerEvent as RPointerEvent, type RefObject } from 'react'
import { clipEnd, type Project } from '../model'
import { removeMarker, splitAt } from '../ops'
import { useEditor } from '../editor.store'
import { TL } from '../../config/timeline'
import { clampTrackShift, previewOf, snapMove, snapOne, type Drag, type SnapEnv } from './timelineDrags'
import { clamp, clampScroll, clipsInRect, laneAt } from './timelineMath'

export type Marquee = { t0: number; y0: number; t1: number; y1: number } // times + content y, so autoscroll keeps the anchor
export type TimelineUi = {
  setPreview: (p: Project | null) => void
  setSnapAt: (t: number | null) => void
  setMarquee: (m: Marquee | null) => void
}
type Pt = { cx: number; cy: number; x: number; y: number; t: number }
type Refs = { root: RefObject<HTMLDivElement | null>; lanes: RefObject<HTMLDivElement | null>; razor: RefObject<HTMLDivElement | null> }

const st = () => useEditor.getState()
const envOf = (): SnapEnv => { const s = st(); return { enabled: s.snap, playhead: s.playhead, pxPerSec: s.pxPerSec } }
const endOf = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)

export function useTimelineInput({ root, lanes, razor }: Refs, ui: TimelineUi, ready: boolean) {
  const point = (cx: number, cy: number): Pt => {
    const el = lanes.current!, r = el.getBoundingClientRect(), s = st()
    const x = cx - r.left
    return { cx, cy, x, y: cy - r.top + el.scrollTop, t: (x + s.scrollX) / s.pxPerSec }
  }
  const scrollTo = (x: number) => {
    const s = st(), w = lanes.current?.clientWidth ?? 0
    const v = clampScroll(x, s.project ? endOf(s.project) : 0, s.pxPerSec, w)
    if (Math.abs(v - s.scrollX) > 0.01) s.setScroll(v)
  }
  const zoomAt = (x: number, pps: number) => {
    const s = st(), next = clamp(pps, TL.minPps, TL.maxPps), anchor = (x + s.scrollX) / s.pxPerSec
    if (next === s.pxPerSec) return
    s.setZoom(next, anchor)   // the store keeps the anchor time under the same screen x
    const a = st(), v = clampScroll(a.scrollX, a.project ? endOf(a.project) : 0, a.pxPerSec, lanes.current?.clientWidth ?? 0)
    if (v !== a.scrollX) a.setScroll(v)
  }

  // Generic pointer drag on window: threshold, edge autoscroll, Escape to cancel.
  function runDrag(e: { clientX: number; clientY: number }, kind: string, o: { auto?: boolean; threshold?: number },
    step: (pt: Pt) => void, end: (moved: boolean, cancel: boolean) => void) {
    let moved = false, raf = 0, last = { cx: e.clientX, cy: e.clientY }
    const thr = o.threshold ?? TL.dragStartPx
    root.current!.dataset.drag = kind
    const frame = () => {
      raf = 0
      const r = lanes.current!.getBoundingClientRect(), x = last.cx - r.left, z = TL.autoScrollZonePx
      const v = x < z ? -(z - x) / z : x > r.width - z ? (x - (r.width - z)) / z : 0
      if (!v) return
      scrollTo(st().scrollX + clamp(v, -1, 1) * TL.autoScrollMax)
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

  // Replay a clip drag as a live preview; commit once on release.
  function dragClips(e: RPointerEvent, kind: string, make: (pt: Pt, base: Project) => { d: Drag; at: number | null }, onClick?: () => void) {
    const base = st().project!
    let final: Project | null = null
    runDrag(e, kind, { auto: true }, pt => {
      const { d, at } = make(pt, base)
      final = previewOf(base, d); ui.setPreview(final); ui.setSnapAt(at)
    }, (moved, cancel) => {
      ui.setPreview(null); ui.setSnapAt(null)
      if (!moved && !cancel) onClick?.()
      if (!moved || cancel || !final || final === base) return
      const out = final, had = new Set(base.clips.map(c => c.id))
      st().apply(() => out)
      if (kind === 'dup') st().select(out.clips.filter(c => !had.has(c.id)).map(c => c.id))
    })
  }

  function onLanesDown(e: RPointerEvent) {
    const s = st(), base = s.project
    if (!base || (e.button !== 0 && e.button !== 1)) return
    const el = e.target as Element, clipEl = el.closest<HTMLElement>('[data-clip]')
    const pt = point(e.clientX, e.clientY)
    const tool = e.button === 1 ? 'hand' : s.tool
    if (tool === 'hand') {
      e.preventDefault()
      const sx = s.scrollX, sy = lanes.current!.scrollTop
      return runDrag(e, 'pan', {}, p => { scrollTo(sx - (p.cx - e.clientX)); lanes.current!.scrollTop = sy - (p.cy - e.clientY) }, () => {})
    }
    if (tool === 'zoom') return zoomAt(pt.x, s.pxPerSec * (e.altKey ? 1 / TL.zoomStep : TL.zoomStep))
    if (tool === 'razor') {
      const ids = e.shiftKey ? undefined : clipEl ? [clipEl.dataset.clip!] : null
      if (ids === null) return
      const t = Math.max(0, snapOne(base, Math.max(0, pt.t), envOf()).t)
      return s.apply(p => splitAt(p, t, ids))
    }
    const clip = clipEl && base.clips.find(c => c.id === clipEl.dataset.clip)
    if (!clip) return startMarquee(e, pt, base)
    const locked = base.tracks.find(t => t.id === clip.track)?.lock
    let sel = s.selection
    if (e.shiftKey) {
      if (sel.includes(clip.id)) return s.select(sel.filter(i => i !== clip.id))
      s.select([clip.id], true); sel = [...sel, clip.id]
    } else if (!sel.includes(clip.id)) { s.select([clip.id]); sel = [clip.id] }
    if (locked) return
    const edge = el.closest<HTMLElement>('[data-edge]')?.dataset.edge as 'in' | 'out' | undefined
    const lane0 = base.tracks.findIndex(t => t.id === clip.track)
    const ids = sel.filter(id => { const c = base.clips.find(x => x.id === id); return c && !base.tracks.find(t => t.id === c.track)?.lock })
    if (edge && (tool === 'select' || tool === 'ripple')) {
      const ripple = tool === 'ripple' || e.metaKey, orig = edge === 'in' ? clip.start : clipEnd(clip)
      return dragClips(e, 'trim', p => {
        const raw = orig + (p.t - pt.t), sn = s.snap ? snapOne(base, raw, envOf(), [clip.id]) : { t: raw, at: null }
        return { d: { kind: 'trim', id: clip.id, edge, t: Math.max(0, sn.t), ripple }, at: sn.at }
      })
    }
    if (tool === 'slip') return dragClips(e, 'slip', p => ({ d: { kind: 'slip', ids, dsrc: -(p.t - pt.t) }, at: null }))
    if (tool === 'ripple') return
    const dup = e.altKey
    dragClips(e, dup ? 'dup' : 'move', p => {
      const sn = snapMove(base, ids, p.t - pt.t, envOf())
      const head = Math.min(...base.clips.filter(c => ids.includes(c.id)).map(c => c.start))
      const shift = dup ? 0 : clampTrackShift(base, ids, laneAt(p.y) - lane0)
      return { d: { kind: 'move', ids, dt: Math.max(sn.dt, -head), trackShift: shift, dup }, at: sn.at }
    }, () => { if (!e.shiftKey && sel.length > 1) s.select([clip.id]) })   // plain click inside a multi-selection narrows it
  }

  function startMarquee(e: RPointerEvent, pt: Pt, base: Project) {
    const keep = e.shiftKey ? st().selection : []
    if (!e.shiftKey) st().select([])
    let key = keep.join()
    runDrag(e, 'marquee', { auto: true }, p => {
      ui.setMarquee({ t0: pt.t, y0: pt.y, t1: p.t, y1: p.y })
      const ids = [...new Set([...keep, ...clipsInRect(base, pt.t, p.t, pt.y, p.y)])]
      if (ids.join() !== key) { key = ids.join(); st().select(ids) }
    }, () => ui.setMarquee(null))
  }

  function onRulerDown(e: RPointerEvent) {
    const base = st().project
    if (!base || e.button !== 0) return
    let queued: number | null = null, raf = 0
    const seek = (p: Pt, now = false) => {
      const raw = Math.max(0, p.t), s = st()
      queued = TL.scrubSnap && s.snap ? snapOne(base, raw, envOf()).t : raw
      if (now) { s.setPlayhead(queued); queued = null; return }
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (queued !== null) st().setPlayhead(queued); queued = null })
    }
    seek(point(e.clientX, e.clientY), true)
    runDrag(e, 'scrub', { auto: true, threshold: 0 }, p => seek(p), () => {
      if (raf) cancelAnimationFrame(raf)
      if (queued !== null) st().setPlayhead(queued)
    })
  }

  function onLanesMove(e: RPointerEvent) {
    const g = razor.current, s = st()
    if (!g) return
    if (s.tool !== 'razor' || !s.project || root.current?.dataset.drag) { g.style.display = 'none'; return }
    const pt = point(e.clientX, e.clientY), t = snapOne(s.project, Math.max(0, pt.t), envOf()).t
    g.style.display = 'block'
    g.style.transform = `translate(${t * s.pxPerSec - s.scrollX}px, ${e.shiftKey ? 0 : laneAt(pt.y) * TL.laneH}px)`
    g.style.height = e.shiftKey ? '100%' : `${TL.laneH}px`
  }
  const onLanesLeave = () => { if (razor.current) razor.current.style.display = 'none' }
  const onMarker = (id: string, t: number, alt: boolean) => (alt ? st().apply(p => removeMarker(p, id)) : st().setPlayhead(t))

  // Wheel / pinch: native listener because React's onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const k = e.deltaMode === 1 ? TL.wheelLineScale : 1
      const dx = e.deltaX * k, dy = e.deltaY * k, s = st(), ln = lanes.current
      const x = e.clientX - el.getBoundingClientRect().left
      if (e.ctrlKey || e.metaKey) return zoomAt(x, s.pxPerSec * Math.exp(-clamp(dy, -60, 60) * TL.zoomWheelK))
      if (Math.abs(dx) > Math.abs(dy) || e.shiftKey) return scrollTo(s.scrollX + (dx || dy))
      if (ln && ln.scrollHeight > ln.clientHeight + 1) ln.scrollTop += dy
      else scrollTo(s.scrollX + dy)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ready])  // eslint-disable-line react-hooks/exhaustive-deps -- handlers read live state through the store

  return { onLanesDown, onLanesMove, onLanesLeave, onRulerDown, onMarker }
}

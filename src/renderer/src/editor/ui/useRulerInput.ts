import type { MouseEvent as RMouseEvent, PointerEvent as RPointerEvent, RefObject } from 'react'
import type { Marker } from '../model'
import { TL } from '../../config/timeline'
import { st, type View } from './dragRunner'
import { moveMarker, snapOne, type SnapEnv } from './timelineDrags'
import { rulerMenu } from './timelineMenus'
import type { TimelineUi } from './timelineUi'
import { formatTimecode } from './timelineMath'
import { hideHud, showHud } from './hud'

const envOf = (): SnapEnv => { const s = st(); return { enabled: s.snap, playhead: s.playhead, pxPerSec: s.pxPerSec, beats: s.beatSnap } }

/** Ruler gestures: scrub (with audio scrub), drag markers, drag the In/Out range, context menu. */
export function useRulerInput(view: View, ui: TimelineUi, hud: RefObject<HTMLDivElement | null>, root: RefObject<HTMLDivElement | null>) {
  function onRulerDown(e: RPointerEvent) {
    const base = st().project
    if (!base || e.button !== 0) return
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    let queued: number | null = null, raf = 0
    const seek = (t: number, now = false) => {
      const raw = Math.max(0, t), s = st()
      queued = TL.scrubSnap && s.snap ? snapOne(base, raw, envOf()).t : raw
      const go = () => { const q = queued; queued = null; if (q === null) return; if (st().playing) st().setPlayhead(q); else st().scrubTo(q) }
      if (now) return go()
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; go() })
    }
    seek(view.point(e.clientX, e.clientY).t, true)
    view.runDrag(e, 'scrub', { auto: true, threshold: 0 }, p => seek(p.t), () => {
      if (raf) cancelAnimationFrame(raf)
      if (queued !== null) { const q = queued; queued = null; st().setPlayhead(q) }
      else if (!st().playing) st().setPlayhead(st().playhead)   // land the transport on the final scrub position
    })
  }

  function onMarker(m: Marker, e: RPointerEvent) {
    const base = st().project
    if (!base || e.button !== 0) return
    if (e.altKey) return st().removeMarker(m.id)
    const others = { ...base, markers: base.markers.filter(x => x.id !== m.id) }
    let at = m.t
    view.runDrag(e, 'marker', { auto: true, threshold: TL.markerDragPx }, p => {
      const sn = snapOne(others, Math.max(0, p.t), envOf())
      at = sn.t; ui.setPreview(moveMarker(base, m.id, at)); ui.setSnapAt(sn.at)
      showHud(hud, root.current, formatTimecode(at), p.cx, p.cy)
    }, (moved, cancel) => {
      ui.setPreview(null); ui.setSnapAt(null); hideHud(hud)
      if (!moved) return st().setPlayhead(m.t)
      if (!cancel) st().apply(p => moveMarker(p, m.id, at))
    })
  }

  function onRange(part: 'in' | 'out' | 'body', e: RPointerEvent) {
    const s = st(), a = s.markIn, b = s.markOut
    if (a === null || b === null || e.button !== 0) return
    const t0 = view.point(e.clientX, e.clientY).t
    let r = { in: a, out: b }
    view.runDrag(e, 'range', { auto: true }, p => {
      const sn = snapOne(s.project!, Math.max(0, p.t), envOf()), t = sn.t
      if (part === 'in') r = { in: Math.min(t, b - 0.001), out: b }
      else if (part === 'out') r = { in: a, out: Math.max(t, a + 0.001) }
      else { const dt = Math.max(-a, p.t - t0); r = { in: a + dt, out: b + dt } }
      ui.setRange(r); ui.setSnapAt(part === 'body' ? null : sn.at)
    }, (moved, cancel) => {
      ui.setRange(null); ui.setSnapAt(null)
      if (!moved || cancel) return
      st().setMark('in', r.in); st().setMark('out', r.out)
    })
  }

  function onRulerContext(e: RMouseEvent) {
    e.preventDefault()
    const t = Math.max(0, view.point(e.clientX, e.clientY).t)
    const marker = (e.target as Element).closest<HTMLElement>('[data-marker]')?.dataset.marker
    rulerMenu(e.clientX, e.clientY, t, marker)
  }
  return { onRulerDown, onMarker, onRange, onRulerContext }
}

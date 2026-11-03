import type { PointerEvent as RPointerEvent } from 'react'
import type { Project } from '../model'
import { TL } from '../../config/timeline'
import { useEditor } from '../editor.store'
import { anyOverlay } from '../overlayStore'
import type { RangeSel } from '../storeTypes'
import { envOf, layOf, st, type Pt, type View, type ViewRefs } from './dragRunner'
import { hideHud, showHud } from './hud'
import { useRangeLive } from './rangeLive'
import { snapOne } from './timelineDrags'
import { clamp, formatTimecode, laneAt } from './timelineMath'
import type { Guides } from './timelineUi'

const text = (r: RangeSel) => `RANGE ${formatTimecode(r.a)} - ${formatTimecode(r.b)}  ${(r.b - r.a).toFixed(3)}s`

/** The Range tool: draw a rectangle across lanes (Option-drag does it from the select tool), resize it from its side handles. */
export function useRangeInput(view: View, { root }: ViewRefs, guides: Guides) {
  const snap = (t: number) => { const s = st(); return Math.max(0, s.snap && s.project ? snapOne(s.project, t, envOf()).t : t) }

  function drag(e: { clientX: number; clientY: number }, make: (p: Pt) => RangeSel) {
    let cur: RangeSel | null = null
    view.runDrag(e, 'range', { auto: true }, p => {
      cur = make(p)
      useRangeLive.setState({ draft: cur })
      showHud(guides.hud, root.current, text(cur), p.cx, p.cy)
    }, (moved, cancel) => {
      useRangeLive.setState({ draft: null }); hideHud(guides.hud)
      if (cancel) return
      if (!moved) return st().setRange(null)                     // a plain click with the range tool clears it
      if (cur && cur.b - cur.a >= TL.rangeMinSec) st().setRange(cur)
    })
  }

  function rangeDown(e: RPointerEvent, pt: Pt, base: Project) {
    const L = layOf(base), n = base.tracks.length, lane0 = clamp(laneAt(L, pt.y), 0, n - 1), t0 = snap(pt.t)
    drag(e, p => {
      const t1 = snap(p.t), l1 = clamp(laneAt(L, p.y), 0, n - 1), lo = Math.min(lane0, l1), hi = Math.max(lane0, l1)
      const tracks = lo === 0 && hi === n - 1 ? null : base.tracks.slice(lo, hi + 1).map(t => t.id)
      return { a: Math.min(t0, t1), b: Math.max(t0, t1), tracks }
    })
  }

  /** Grab a side handle: the other side stays put, dragging past it flips them. */
  function edgeDown(e: RPointerEvent, side: 'a' | 'b') {
    const r = st().range
    if (!r || e.button !== 0) return
    e.stopPropagation(); e.preventDefault()
    const fixed = side === 'a' ? r.b : r.a
    drag(e, p => { const t = snap(p.t); return { a: Math.min(t, fixed), b: Math.max(t, fixed), tracks: r.tracks } })
  }
  return { rangeDown, edgeDown }
}

// Delete / ⇧⌫ act on the range (lift / extract). Registered once at load, in the capture phase, so it runs before the
// editor's own key handler (which would delete the selected clips instead) and stops it. Does nothing without a range.
const KEY = '__svRangeKeys'
const w = window as unknown as Record<string, ((e: KeyboardEvent) => void) | undefined>
const typing = (t: EventTarget | null) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t instanceof HTMLElement && t.isContentEditable)
if (w[KEY]) window.removeEventListener('keydown', w[KEY]!, true)
w[KEY] = (e: KeyboardEvent) => {
  if (e.key !== 'Delete' && e.key !== 'Backspace') return
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || anyOverlay()) return
  const s = useEditor.getState()
  if (!s.open || !s.range || (s.tool !== 'range' && s.selection.length)) return
  e.stopImmediatePropagation(); e.preventDefault()
  if (e.shiftKey) s.extractRangeSel(); else s.liftRangeSel()
}
window.addEventListener('keydown', w[KEY]!, true)

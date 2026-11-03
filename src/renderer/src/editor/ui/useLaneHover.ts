import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import { clipSpeed } from '../model'
import { TL } from '../../config/timeline'
import { envOf, layOf, st, type View, type ViewRefs } from './dragRunner'
import { hideHud, showHud } from './hud'
import { snapOne } from './timelineDrags'
import { clipLenText, clipTitle, findCut, fmtDb, formatTimecode, laneAt } from './timelineMath'
import type { Guides } from './timelineUi'

/** Hover feedback on the lanes: razor preview line, rolling-edit cut highlight, and the start/length/gain tooltip. */
export function useLaneHover(view: View, { root }: ViewRefs, guides: Guides) {
  const tip = useRef(0), lastMove = useRef<PointerEvent | RPointerEvent | null>(null)
  const { point } = view
  function hover(e: PointerEvent | RPointerEvent) {
    const s = st(), p = s.project, r = guides.razor.current, hot = guides.hot.current, rt = root.current
    if (!p || !r || !hot || !rt) return
    const dragging = !!rt.dataset.drag
    r.style.display = 'none'; hot.style.display = 'none'; delete rt.dataset.hot
    window.clearTimeout(tip.current)
    if (dragging) return
    const pt = point(e.clientX, e.clientY), L = layOf(p), lane = laneAt(L, pt.y), tool = s.tool as string
    if (tool === 'razor') {
      const all = e.shiftKey || e.altKey, t = snapOne(p, Math.max(0, pt.t), envOf()).t
      r.style.display = 'block'
      r.style.transform = `translate(${t * s.pxPerSec - s.scrollX}px, ${all ? 0 : (L.tops[lane] ?? 0)}px)`
      r.style.height = all ? '100%' : `${L.hs[lane] ?? 0}px`
      r.dataset.all = all ? '1' : '0'
      return
    }
    const tr = p.tracks[lane]
    if (tool === 'roll' && tr) {
      const cut = findCut(p, tr.id, pt.t, TL.cutHitPx / s.pxPerSec)
      if (cut) {
        hot.style.display = 'block'; rt.dataset.hot = 'cut'
        hot.style.transform = `translate(${cut.t * s.pxPerSec - s.scrollX}px, ${L.tops[lane]}px)`; hot.style.height = `${L.hs[lane]}px`
      }
      return
    }
    const id = (e.target as Element).closest<HTMLElement>('[data-clip]')?.dataset.clip, c = id ? p.clips.find(x => x.id === id) : undefined
    if (!c || (e.target as Element).closest('[data-gain],[data-fade]')) return
    const cx = e.clientX, cy = e.clientY
    tip.current = window.setTimeout(() => {
      if (root.current?.dataset.drag) return
      showHud(guides.hud, root.current, `${clipTitle(c)}  START ${formatTimecode(c.start)}  LEN ${clipLenText(c)}  GAIN ${fmtDb(c.gain)}${clipSpeed(c) !== 1 ? `  ${Math.round(clipSpeed(c) * 100)}%` : ''}`, cx, cy)
    }, TL.hoverTipMs)
  }
  const onLanesMove = (e: RPointerEvent) => { lastMove.current = e; hideHud(guides.hud); hover(e) }
  const onLanesLeave = () => {
    window.clearTimeout(tip.current); hideHud(guides.hud); lastMove.current = null
    for (const g of [guides.razor, guides.hot]) if (g.current) g.current.style.display = 'none'
  }
  // Shift/Alt toggle "all tracks" on the razor line without a mouse move.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => { if ((ev.key === 'Shift' || ev.key === 'Alt') && lastMove.current) hover(lastMove.current) }
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKey)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKey); window.clearTimeout(tip.current) }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps -- reads live state through the store

  return { onLanesMove, onLanesLeave }
}

import { useCallback, useMemo, type PointerEvent as RPointerEvent } from 'react'
import { clipEnd, type Loop, type Project } from '../model'
import { updateLoop } from '../ops'
import { TL } from '../../config/timeline'
import { cancelGlide, envOf, st, type View, type ViewRefs } from './dragRunner'
import { hideHud, showHud } from './hud'
import { groupLoops, handlePatch, loopGeom, type LoopHandle } from './loopMath'
import { formatTimecode } from './timelineMath'
import { snapOne } from './timelineDrags'
import type { Guides, TimelineUi } from './timelineUi'

const KEYS = ['srcIn', 'srcOut', 'count', 'xfade', 'tail'] as const
const SELECTING = new Set(['select', 'ripple', 'slip', 'rate'])
let gesture = 0

function hudOf(which: LoopHandle, l: Loop): string {
  const len = l.srcOut - l.srcIn
  switch (which) {
    case 'in': return `LOOP START ${formatTimecode(l.srcIn)}  LEN ${Math.round(len * 1000)} ms`
    case 'out': return `LOOP END ${formatTimecode(l.srcOut)}  LEN ${Math.round(len * 1000)} ms`
    case 'xfade': return `CROSSFADE ${Math.round(l.xfade * 1000)} ms`
    case 'tail': return `LAST REPEAT ${(l.tail ?? 0) >= 0 ? '+' : ''}${Math.round((l.tail ?? 0) * 1000)} ms`
    case 'count': return `LOOP x${l.count}`
  }
}

/** Loop handles (begin, end, crossfade, repeats) and whole-loop selection. A drag previews the regenerated loop through ui.setPreview
 *  (one rAF-coalesced path, no store writes) and commits ONCE on release through updateLoopLive with a coalesce key. */
export function useLoopInput(view: View, { root }: ViewRefs, guides: Guides, ui: TimelineUi) {
  const onHandle = useCallback((e: RPointerEvent, which: LoopHandle, loopId: string) => {
    e.stopPropagation()
    if (e.button !== 0) return
    const base: Project | null = st().project, L0 = base?.loops?.find(l => l.id === loopId)
    const groups = base ? groupLoops(base.clips) : null, g = loopGeom(groups?.get(loopId))
    if (!base || !L0 || !g) return
    const ids = groups!.get(loopId)!.map(c => c.id)
    const edge0 = which === 'in' ? g.start : which === 'out' ? clipEnd(g.first) : which === 'xfade' ? (g.second?.start ?? g.start) : g.end
    const t0 = view.point(e.clientX, e.clientY).t, key = `loop-${which}-${++gesture}`
    let lastT = t0, acc = 0, target = 0, shown = 0, raf = 0, mods = { alt: e.altKey, meta: e.metaKey }, final: Project | null = null, finalLoop: Loop | null = null
    const onMove = (ev: PointerEvent) => { mods = { alt: ev.altKey, meta: ev.metaKey } }
    window.addEventListener('pointermove', onMove)
    const render = (d: number) => {
      const out = updateLoop(base, loopId, handlePatch(which, L0, d))
      final = out; finalLoop = out.loops?.find(l => l.id === loopId) ?? null
      ui.setPreview(out)
    }
    const frame = () => {
      raf = 0
      if (which === 'count') shown = target
      else shown += (target - shown) * TL.loopEase
      if (Math.abs(target - shown) < TL.loopEaseEps) shown = target
      render(shown)
      if (shown !== target) raf = requestAnimationFrame(frame)
    }
    cancelGlide()
    view.runDrag(e, 'loop', { auto: which === 'count' }, pt => {
      acc += (pt.t - lastT) * (mods.alt ? TL.loopFine : 1); lastT = pt.t
      let d = acc
      if (mods.meta && !mods.alt && which !== 'count') d = snapOne(base, edge0 + acc, { ...envOf(), enabled: true }, ids).t - edge0   // Cmd snaps; otherwise it glides
      target = d
      if (!raf) raf = requestAnimationFrame(frame)
      showHud(guides.hud, root.current, hudOf(which, finalLoop ?? L0), pt.cx, pt.cy)
    }, (moved, cancel) => {
      window.removeEventListener('pointermove', onMove)
      if (raf) cancelAnimationFrame(raf)
      if (moved && !cancel && target !== shown) render(target)   // land exactly where the pointer ended
      hideHud(guides.hud); ui.setPreview(null)
      if (!moved || cancel || !final || !finalLoop) return
      const patch: Record<string, number> = {}
      for (const k of KEYS) if ((finalLoop[k] ?? 0) !== (L0[k] ?? 0)) patch[k] = finalLoop[k] ?? 0
      if (Object.keys(patch).length) st().updateLoopLive(loopId, patch, key)
    })
  }, [view, root, guides, ui])

  /** Capture-phase pointerdown on the lanes: pressing any repeat selects the whole loop BEFORE the normal handler picks the drag. */
  const onSelectCapture = useCallback((e: RPointerEvent) => {
    if (e.button !== 0) return
    const s = st(), p = s.project
    if (!p?.loops?.length || !SELECTING.has(s.tool)) return
    const id = (e.target as Element).closest<HTMLElement>('[data-clip]')?.dataset.clip, clip = id ? p.clips.find(c => c.id === id) : undefined
    if (!clip?.loop) return
    const ids = p.clips.filter(c => c.loop === clip.loop).map(c => c.id), sel = new Set(s.selection), all = ids.every(i => sel.has(i))
    if (e.shiftKey) {   // shift toggles the whole loop in or out of the selection
      e.stopPropagation(); s.selectGap(null)
      s.select(all ? s.selection.filter(i => !ids.includes(i)) : [...s.selection, ...ids.filter(i => !sel.has(i))])
    } else if (!all) s.select(ids)
  }, [])

  return useMemo(() => ({ onHandle, onSelectCapture }), [onHandle, onSelectCapture])
}

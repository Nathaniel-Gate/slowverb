import { useEffect, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react'
import { clipDur, clipEnd, type Project } from '../model'
import { clipsForward, patchClips, splitAt } from '../ops'
import { TL } from '../../config/timeline'
import { cancelGlide, envOf, layOf, st, type Pt, type View, type ViewRefs } from './dragRunner'
import { hideHud, showHud } from './hud'
import { clampTrackShift, hudText, previewOf, snapMove, snapOne, type Drag } from './timelineDrags'
import { clamp, clipBox, clipsInRect, findCut, gainToY, gapAt, laneAt, slipDelta, yToGain } from './timelineMath'
import { clipMenu, gapMenu, laneMenu } from './timelineMenus'
import type { Guides, TimelineUi } from './timelineUi'

type Made = { d: Drag; at: number | null }
const DONE: Record<Drag['kind'], string> = { move: 'Moved', trim: 'Trimmed', slip: 'Slipped', fade: 'Fade', gain: 'Gain', roll: 'Rolled', stretch: 'Stretched' }

/** Everything the pointer does on the lanes, per tool. Drags build a small Drag description, preview it, and commit once on release. */
export function useTimelineInput(view: View, { root, lanes }: ViewRefs, guides: Guides, ui: TimelineUi, ready: boolean) {
  const { point, runDrag, scrollTo, zoomAt } = view

  function dragClips(e: RPointerEvent, kind: string, make: (pt: Pt, base: Project) => Made, onClick?: () => void) {
    const base = st().project!
    let final: Project | null = null, lastD: Drag | null = null
    runDrag(e, kind, { auto: true }, pt => {
      const { d, at } = make(pt, base)
      lastD = d
      final = previewOf(base, d); ui.setPreview(final); ui.setSnapAt(at)
      showHud(guides.hud, root.current, hudText(d, final), pt.cx, pt.cy)
    }, (moved, cancel) => {
      ui.setPreview(null); ui.setSnapAt(null); hideHud(guides.hud)
      if (!moved && !cancel) onClick?.()
      if (!moved || cancel || !final || final === base) return
      const out = final, had = new Set(base.clips.map(c => c.id)), s = st()
      if (lastD?.kind === 'roll') s.rollEdit(lastD.left, lastD.right, lastD.t)           // store actions carry the toast
      else if (lastD?.kind === 'stretch') s.rateStretch(lastD.id, lastD.newEnd)
      else { s.apply(() => out); if (lastD) s.showToast(`${DONE[lastD.kind]} ${hudText(lastD, out)}`) }
      if (kind === 'dup') st().select(out.clips.filter(c => !had.has(c.id)).map(c => c.id))
    })
  }

  function startMarquee(e: RPointerEvent, pt: Pt, base: Project, onClick?: () => void) {
    const keep = e.shiftKey ? st().selection : []
    if (!e.shiftKey) st().select([])
    st().selectGap(null)
    let key = keep.join()
    const L = layOf(base)
    runDrag(e, 'marquee', { auto: true }, p => {
      ui.setMarquee({ t0: pt.t, y0: pt.y, t1: p.t, y1: p.y })
      const ids = [...new Set([...keep, ...clipsInRect(base, L, pt.t, p.t, pt.y, p.y)])]
      if (ids.join() !== key) { key = ids.join(); st().select(ids) }
    }, moved => { ui.setMarquee(null); if (!moved) onClick?.() })
  }

  /** Click empty lane space: select the gap there; drag: rubber-band marquee. */
  function emptyDown(e: RPointerEvent, pt: Pt, base: Project) {
    const track = base.tracks[laneAt(layOf(base), pt.y)]?.id, gap = track ? gapAt(base, track, pt.t) : null
    startMarquee(e, pt, base, () => { if (gap) { st().select([]); st().selectGap(gap) } })
  }

  function zoomDown(e: RPointerEvent, pt: Pt) {
    const s = st(), ln = lanes.current!
    let t1 = pt.t
    runDrag(e, 'marquee', { threshold: 6 }, p => {
      t1 = p.t
      ui.setMarquee({ t0: pt.t, y0: ln.scrollTop, t1: p.t, y1: ln.scrollTop + ln.clientHeight })
    }, (moved, cancel) => {
      ui.setMarquee(null)
      if (moved && !cancel && Math.abs(t1 - pt.t) > TL.miniMinViewSec) view.zoomToRange(Math.min(pt.t, t1), Math.max(pt.t, t1))
      else if (!moved) zoomAt(pt.x, s.pxPerSec * (e.altKey ? 1 / TL.zoomStep : TL.zoomStep), true)
    })
  }

  function razorDown(e: RPointerEvent, pt: Pt, base: Project, clipEl: HTMLElement | null) {
    const all = e.shiftKey || e.altKey, ids = all ? undefined : clipEl ? [clipEl.dataset.clip!] : null
    if (ids === null) return
    const t = Math.max(0, snapOne(base, Math.max(0, pt.t), envOf()).t), L = layOf(base)
    const lane = laneAt(L, pt.y)
    st().apply(p => splitAt(p, t, ids))
    if (st().project !== base) all ? ui.flash(t, 0, L.total) : ui.flash(t, L.tops[lane] ?? 0, L.hs[lane] ?? 0)
  }

  function rollDown(e: RPointerEvent, pt: Pt, base: Project) {
    const L = layOf(base), tr = base.tracks[laneAt(L, pt.y)]
    const cut = tr && findCut(base, tr.id, pt.t, TL.cutHitPx / st().pxPerSec)
    if (!cut || tr.lock) return startMarquee(e, pt, base)
    dragClips(e, 'roll', p => {
      const sn = st().snap ? snapOne(base, p.t, envOf(), [cut.left, cut.right]) : { t: p.t, at: null }
      return { d: { kind: 'roll', left: cut.left, right: cut.right, t: sn.t }, at: sn.at }
    })
  }

  function onLanesDown(e: RPointerEvent) {
    const s = st(), base = s.project
    if (!base || (e.button !== 0 && e.button !== 1)) return
    const act = document.activeElement as HTMLElement | null
    if (act && act !== document.body) act.blur()
    root.current?.focus({ preventScroll: true })
    const el = e.target as Element, clipEl = el.closest<HTMLElement>('[data-clip]')
    const pt = point(e.clientX, e.clientY), tool = (e.button === 1 ? 'hand' : s.tool) as string
    if (tool === 'hand') {
      e.preventDefault()
      const sx = s.scrollX, sy = lanes.current!.scrollTop
      return runDrag(e, 'pan', {}, p => { scrollTo(sx - (p.cx - e.clientX)); lanes.current!.scrollTop = sy - (p.cy - e.clientY) }, () => {})
    }
    cancelGlide()
    if (tool === 'zoom') return zoomDown(e, pt)
    if (tool === 'razor') return razorDown(e, pt, base, clipEl)
    if (tool === 'roll') return rollDown(e, pt, base)
    const clip = clipEl && base.clips.find(c => c.id === clipEl.dataset.clip)
    if (!clip) {
      if (tool === 'trackfwd') {
        const tr = base.tracks[laneAt(layOf(base), pt.y)]
        if (tr) return s.select(clipsForward(base, pt.t, e.shiftKey ? undefined : [tr.id]))
      }
      return emptyDown(e, pt, base)
    }
    const locked = base.tracks.find(t => t.id === clip.track)?.lock
    const fadeEl = el.closest<HTMLElement>('[data-fade]'), gainEl = el.closest('[data-gain]')
    let sel = s.selection
    s.selectGap(null)
    if (tool === 'trackfwd') { sel = clipsForward(base, clip.start, e.shiftKey ? undefined : [clip.track]); s.select(sel) }
    else if (e.shiftKey && !fadeEl && !gainEl) {
      if (sel.includes(clip.id)) return s.select(sel.filter(i => i !== clip.id))
      s.select([clip.id], true); sel = [...sel, clip.id]
    } else if (!sel.includes(clip.id)) { s.select([clip.id]); sel = [clip.id] }
    if (locked) return
    const L = layOf(base), lane0 = base.tracks.findIndex(t => t.id === clip.track), box = clipBox(L, lane0)
    if (tool === 'select' && fadeEl) {
      const edge = fadeEl.dataset.fade as 'in' | 'out'
      return dragClips(e, 'fade', p => {
        const sn = st().snap ? snapOne(base, p.t, envOf(), [clip.id]) : { t: p.t, at: null }
        const dur = edge === 'in' ? sn.t - clip.start : clipEnd(clip) - sn.t
        return { d: { kind: 'fade', id: clip.id, edge, dur: clamp(dur, 0, clipDur(clip)) }, at: null }
      })
    }
    if (tool === 'select' && gainEl) {
      const y0 = gainToY(clip.gain, box.h)
      return dragClips(e, 'gain', p => ({ d: { kind: 'gain', id: clip.id, gain: yToGain(y0 + (p.y - pt.y) * (e.altKey ? TL.gainFine : 1), box.h) }, at: null }))
    }
    const edge = el.closest<HTMLElement>('[data-edge]')?.dataset.edge as 'in' | 'out' | undefined
    const ids = sel.filter(id => { const c = base.clips.find(x => x.id === id); return c && !base.tracks.find(t => t.id === c.track)?.lock })
    if (edge && (tool === 'select' || tool === 'ripple')) {
      const ripple = tool === 'ripple' || e.metaKey, orig = edge === 'in' ? clip.start : clipEnd(clip)
      return dragClips(e, 'trim', p => {
        const raw = orig + (p.t - pt.t), sn = s.snap ? snapOne(base, raw, envOf(), [clip.id]) : { t: raw, at: null }
        return { d: { kind: 'trim', id: clip.id, edge, t: Math.max(0, sn.t), ripple }, at: sn.at }
      })
    }
    if (tool === 'rate') {
      if (edge !== 'out') return
      return dragClips(e, 'stretch', p => {
        const raw = clipEnd(clip) + (p.t - pt.t), sn = s.snap ? snapOne(base, raw, envOf(), [clip.id]) : { t: raw, at: null }
        return { d: { kind: 'stretch', id: clip.id, newEnd: Math.max(clip.start + 0.02, sn.t) }, at: sn.at }
      })
    }
    if (tool === 'slip') return dragClips(e, 'slip', p => ({ d: { kind: 'slip', ids, dsrc: slipDelta(clip, p.t - pt.t) }, at: null }))
    if (tool === 'ripple') return
    const dup = e.altKey
    dragClips(e, dup ? 'dup' : 'move', p => {
      const sn = snapMove(base, ids, p.t - pt.t, envOf())
      const head = Math.min(...base.clips.filter(c => ids.includes(c.id)).map(c => c.start))
      const shift = dup ? 0 : clampTrackShift(base, ids, laneAt(L, p.y) - lane0)
      return { d: { kind: 'move', ids, dt: Math.max(sn.dt, -head), trackShift: shift, dup }, at: sn.at }
    }, () => { if (!e.shiftKey && sel.length > 1 && tool === 'select') s.select([clip.id]) })   // plain click inside a multi-selection narrows it
  }

  function onLanesDoubleClick(e: RMouseEvent) {
    const s = st(), el = e.target as Element, id = el.closest<HTMLElement>('[data-clip]')?.dataset.clip
    if (!s.project || !id || s.tool !== 'select') return
    if (el.closest('[data-gain]')) s.apply(p => patchClips(p, [id], { gain: 1 }))
    else { const f = el.closest<HTMLElement>('[data-fade]')?.dataset.fade; if (f) s.apply(p => patchClips(p, [id], f === 'in' ? { fadeIn: 0 } : { fadeOut: 0 })) }
  }

  function onLanesContext(e: RMouseEvent) {
    e.preventDefault()
    const s = st(), p = s.project
    if (!p) return
    const pt = point(e.clientX, e.clientY), id = (e.target as Element).closest<HTMLElement>('[data-clip]')?.dataset.clip
    const clip = id ? p.clips.find(c => c.id === id) : undefined
    if (clip) {
      if (!s.selection.includes(clip.id)) s.select([clip.id])
      return clipMenu(e.clientX, e.clientY, clip, p)
    }
    const tr = p.tracks[laneAt(layOf(p), pt.y)], gap = tr ? gapAt(p, tr.id, pt.t) : null
    if (gap) { s.select([]); s.selectGap(gap); return gapMenu(e.clientX, e.clientY, gap) }
    laneMenu(e.clientX, e.clientY, Math.max(0, pt.t))
  }

  // Wheel / pinch: native listener because React's onWheel is passive and cannot preventDefault.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault(); cancelGlide()
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

  return { onLanesDown, onLanesDoubleClick, onLanesContext }
}

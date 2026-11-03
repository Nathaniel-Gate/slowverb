import type { PointerEvent as RPointerEvent } from 'react'
import { TL } from '../../config/timeline'
import { clipDur, clipEnd, type Clip, type Project } from '../model'
import { patchClips } from '../ops'
import { openContextMenu } from './ContextMenu'
import { envOf as clipEnv, insertIndex, multiplierAt } from './envMath'
import { envOf, st, type Pt } from './dragRunner'
import { closeFadePopover, openFadePopover } from './FadeHandles'
import { snapOne, type Drag } from './timelineDrags'
import { clamp, gainToY, yToGain } from './timelineMath'

// Pointer logic for the Resolve-style fade handles and the volume rubber band of one clip. Called from useTimelineInput's
// onLanesDown with its dragClips (preview while dragging, one commit on release).
export type DragClips = (e: RPointerEvent, kind: string, make: (pt: Pt, base: Project) => { d: Drag; at: number | null }, onClick?: () => void) => void
type Ctx = { e: RPointerEvent; pt: Pt; base: Project; clip: Clip; el: Element; box: { y: number; h: number }; dragClips: DragClips }

/** Drag a fade dot (relative to where it was grabbed) or a side zone (the fade edge follows the pointer). Click on a dot opens the curve menu. */
export function fadeDown({ e, pt, base, clip, dragClips }: Ctx, fadeEl: HTMLElement) {
  const edge = fadeEl.dataset.fade as 'in' | 'out', side = fadeEl.hasAttribute('data-side'), dur = clipDur(clip)
  const cur = edge === 'in' ? clip.fadeIn : clip.fadeOut, end = clipEnd(clip)
  closeFadePopover()
  dragClips(e, 'fade', p => {
    const grabbed = edge === 'in' ? clip.start + cur : end - cur
    const raw = side ? p.t : grabbed + (p.t - pt.t)
    const sn = st().snap ? snapOne(base, raw, envOf(), [clip.id]) : { t: raw, at: null }
    let len = clamp(edge === 'in' ? sn.t - clip.start : end - sn.t, 0, dur)
    if (dur - len < TL.fadeFullPx / st().pxPerSec) len = dur            // dragged right across: mute out
    return { d: { kind: 'fade', id: clip.id, edge, dur: len }, at: sn.at }
  }, () => { if (!side) openFadePopover(clip.id, edge, fadeEl) })
}

/** Rubber band: drag a point, drag the line to add one, Cmd-drag a segment (or the whole level when there is no envelope), Alt-click a point to remove it. */
export function envDown({ e, pt, base, clip, el, box, dragClips }: Ctx) {
  const s = st(), dur = clipDur(clip), env = clipEnv(clip), h = box.h
  const tc = (p: Pt) => clamp(p.t - clip.start, 0, dur)
  const snapT = (p: Pt) => {                                           // clip-relative time of the pointer, snapped to edit points / beats
    const raw = clip.start + tc(p), sn = s.snap ? snapOne(base, raw, envOf(), [clip.id]) : { t: raw, at: null }
    return { t: clamp(sn.t - clip.start, 0, dur), at: sn.at }
  }
  const fine = e.altKey ? TL.gainFine : 1
  const idx = el.closest<SVGElement>('[data-env-pt]')?.dataset.envPt
  if (idx !== undefined) {
    const i = +idx, pt0 = env[i]
    if (!pt0) return
    if (e.altKey) return s.removeEnvPointAt(clip.id, i)
    const y0 = gainToY(clip.gain * pt0.g, h)
    return dragClips(e, 'env', p => {
      const sn = snapT({ ...p, t: clip.start + pt0.t + (p.t - pt.t) })
      const g = e.shiftKey ? pt0.g : multiplierAt(y0 + (p.y - pt.y), h, clip.gain)
      return { d: { kind: 'env', id: clip.id, index: i, add: false, t: sn.t, g }, at: sn.at }
    })
  }
  if (e.metaKey) {
    const y0 = gainToY(clip.gain, h), t0 = tc(pt), i = env.findIndex((p, n) => p.t <= t0 && env[n + 1] && t0 <= env[n + 1].t)
    if (!env.length) return dragClips(e, 'gain', p => ({ d: { kind: 'gain', id: clip.id, gain: yToGain(y0 + (p.y - pt.y) * fine, h) }, at: null }))
    if (i < 0) return
    return dragClips(e, 'env', p => ({ d: { kind: 'envseg', id: clip.id, i, dy: (p.y - pt.y) * fine, h }, at: null }))
  }
  const k = insertIndex(env, tc(pt)), g0 = multiplierAt(pt.y - box.y, h, clip.gain)
  dragClips(e, 'env', p => {
    const sn = snapT(p)
    return { d: { kind: 'env', id: clip.id, index: k, add: true, t: sn.t, g: e.shiftKey ? g0 : multiplierAt(p.y - box.y, h, clip.gain) }, at: sn.at }
  })
}

/** Release of an envelope drag. A single point goes through the store action (one undo step); a first point (which also adds the
 *  unity anchors at both clip ends) and a segment move are one composed edit. */
export function commitEnv(d: Drag, out: Project, base: Project) {
  if (d.kind !== 'env' && d.kind !== 'envseg') return
  const s = st(), c = out.clips.find(x => x.id === d.id), was = base.clips.find(x => x.id === d.id)
  if (!c) return
  if (d.kind === 'env' && c.env?.[d.index] && (!d.add || was?.env?.length)) {
    const pt = c.env[d.index]
    return s.setEnvPointAt(d.id, pt.t, pt.g, d.add ? undefined : d.index)
  }
  s.apply(() => out)
  s.showToast(d.kind === 'env' ? 'Envelope point added' : 'Envelope segment moved')
}

/** Double-click: on a point remove it; on the line clear the envelope (or reset the clip level when there is none). */
export function envDouble(el: Element, clip: Clip) {
  const s = st(), i = el.closest<SVGElement>('[data-env-pt]')?.dataset.envPt
  if (i !== undefined) return s.removeEnvPointAt(clip.id, +i)
  if (clip.env?.length) s.clearEnvSelected(); else s.apply(p => patchClips(p, [clip.id], { gain: 1 }))
}

export function envContext(x: number, y: number, clip: Clip, el: Element) {
  const s = st(), i = el.closest<SVGElement>('[data-env-pt]')?.dataset.envPt
  openContextMenu(x, y, [
    ...(i !== undefined ? [{ label: 'Remove point', run: () => s.removeEnvPointAt(clip.id, +i) }] : []),
    { label: 'Clear envelope', run: () => { s.select([clip.id]); s.clearEnvSelected() }, disabled: !clip.env?.length },
    { label: 'Reset clip gain', run: () => s.apply(p => patchClips(p, [clip.id], { gain: 1 })), disabled: clip.gain === 1 }
  ])
}

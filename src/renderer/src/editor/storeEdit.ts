import { EDITOR } from '../config/editorKeys'
import { clipSpeed, type Project } from './model'
import * as ops from './ops'
import { sweepEmptyTracks } from './tidy'
import type { ClipPatch, Ctx, EditKeys, S } from './storeTypes'
import { fmtDur, fmtTime } from './timefmt'

type Pair = { left: string; right: string }
const sorted = (p: Project, track: string) => p.clips.filter((c) => c.track === track).sort((a, b) => a.start - b.start)

/** Adjacent same-track clip pairs a crossfade could sit between. Two+ selected: pairs inside the selection. One or none: the cut nearest t. */
export function cutPairs(p: Project, sel: string[], t: number): Pair[] {
  const all: { pair: Pair; at: number }[] = []
  for (const tr of p.tracks) { const cs = sorted(p, tr.id); for (let i = 0; i + 1 < cs.length; i++) all.push({ pair: { left: cs[i].id, right: cs[i + 1].id }, at: cs[i + 1].start }) }
  if (sel.length >= 2) return all.filter((x) => sel.includes(x.pair.left) && sel.includes(x.pair.right)).map((x) => x.pair)
  const pool = sel.length ? all.filter((x) => sel.includes(x.pair.left) || sel.includes(x.pair.right)) : all
  const best = pool.sort((a, b) => Math.abs(a.at - t) - Math.abs(b.at - t))[0]
  return best ? [best.pair] : []
}

const describePatch = (p: ClipPatch) => {
  if (p.gain !== undefined) return `Gain ${p.gain > 0 ? (20 * Math.log10(p.gain)).toFixed(1) : '-inf'} dB`
  if (p.speed !== undefined) return `Speed ${Math.round(p.speed * 100)}%`
  if (p.fadeIn !== undefined) return `Fade in ${p.fadeIn.toFixed(2)}s`
  if (p.fadeOut !== undefined) return `Fade out ${p.fadeOut.toFixed(2)}s`
  if (p.disabled !== undefined) return p.disabled ? 'Clip disabled' : 'Clip enabled'
  if (p.label !== undefined) return 'Label changed'
  return 'Clip renamed'
}

/** Cutting, range, selection, track and marker actions of the editor store. */
export function editActions({ get, set, toast, edit, coalesce, targets }: Ctx): Pick<S, EditKeys> {
  const need = () => get().project
  const ids = () => get().selection
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`
  const range = (): [number, number] | null => {
    const { markIn: a, markOut: b } = get()
    if (a === null || b === null || b <= a) { toast('Set In and Out first (I and O)'); return null }
    return [a, b]
  }
  return {
    patchSelected(patch) {
      const sel = ids(); if (!sel.length) return toast('Select a clip first')
      const { speed, ...rest } = patch
      coalesce(`patch:${Object.keys(patch).join()}:${sel.join()}`, (p) => {
        const q = speed !== undefined ? sel.reduce((acc, id) => ops.setClipSpeed(acc, id, speed), p) : p
        return Object.keys(rest).length ? ops.patchClips(q, sel, rest) : q
      })
      toast(describePatch(patch))
    },
    toggleDisable() {
      const p = need(), sel = ids(); if (!p || !sel.length) return toast('Select a clip first')
      const off = p.clips.filter((c) => sel.includes(c.id)).every((c) => c.disabled)
      get().patchSelected({ disabled: !off })
    },
    liftRange() {
      const r = range(); if (!r) return
      edit((p) => ops.liftRange(p, r[0], r[1], targets()), `Lifted ${fmtDur(r[1] - r[0])}`, 'Nothing in that range')
    },
    extractRange() {
      const r = range(); if (!r) return
      edit((p) => ops.extractRange(p, r[0], r[1], targets()), `Extracted ${fmtDur(r[1] - r[0])}`, 'Nothing in that range')
    },
    closeGapAtSelection() {
      const g = get().gap; if (!g) return toast('Select a gap first')
      edit((p) => ops.closeGap(p, g.track, (g.start + g.end) / 2), `Closed gap ${fmtDur(g.end - g.start)}`)
    },
    closeAllGaps() {
      const tr = targets()
      edit((p) => (tr ? tr.reduce((q, id) => ops.closeAllGaps(q, id), p) : ops.closeAllGaps(p)), 'Closed all gaps', 'No gaps to close')
    },
    trimToPlayhead(which, ripple) {
      const t = get().now()
      edit((p) => ops.trimToPlayhead(p, t, which, ripple, targets()), `${ripple ? 'Ripple trimmed' : 'Trimmed'} ${which === 'nextHead' ? 'start' : 'end'} to ${fmtTime(t)}`, 'No clip to trim here')
    },
    rollEdit(l, r, t) { edit((p) => ops.rollEdit(p, l, r, t), `Rolled edit to ${fmtTime(t)}`, 'Cannot roll that far') },
    rateStretch(id, newEnd) {
      edit((p) => ops.rateStretch(p, id, newEnd), (s) => { const c = s.project?.clips.find((x) => x.id === id); return `Speed ${Math.round((c ? clipSpeed(c) : 1) * 100)}%` }, 'Cannot stretch that far')
    },
    repeatSelection(times = 1) {
      const sel = ids(), p = need(); if (!p || !sel.length) return toast('Select a clip first')
      const before = new Set(p.clips.map((c) => c.id))
      if (edit((q) => ops.repeatClips(q, sel, times), `Repeated ${plural(times, 'time')}`)) {
        const added = get().project!.clips.filter((c) => !before.has(c.id)).map((c) => c.id); set({ selection: [...sel, ...added] })
      }
    },
    crossfadeSelection(dur = EDITOR.crossfadeSec) {
      const p = need(); if (!p) return
      const pairs = cutPairs(p, ids(), get().now()); if (!pairs.length) return toast('Select two touching clips')
      edit((q) => pairs.reduce((acc, x) => ops.applyCrossfade(acc, x.left, x.right, dur), q), `Crossfade ${dur.toFixed(2)}s`, 'No source handle left for a crossfade')
    },
    uncrossfadeSelection() {
      const p = need(); if (!p) return
      const pairs = cutPairs(p, ids(), get().now())
      edit((q) => pairs.reduce((acc, x) => ops.removeCrossfade(acc, x.left, x.right), q), 'Crossfade removed', 'No crossfade here')
    },
    nudge(dt) {
      const sel = ids(); if (!sel.length) return toast('Select a clip to nudge')
      coalesce(`nudge:${sel.join()}`, (p) => ops.moveClips(p, sel, dt))
      toast(`Nudged ${dt > 0 ? '+' : ''}${Math.round(dt * 1000)} ms`)
    },
    selectForward() {
      const p = need(); if (!p) return
      const found = ops.clipsForward(p, get().now(), targets()); set({ selection: found, gap: null }); toast(`Selected ${plural(found.length, 'clip')} forward`)
    },
    selectBackward() {
      const p = need(); if (!p) return
      const found = ops.clipsBackward(p, get().now(), targets()); set({ selection: found, gap: null }); toast(`Selected ${plural(found.length, 'clip')} backward`)
    },
    selectGap: (g) => set(g ? { gap: g, selection: [] } : { gap: null }),
    targetTrack(id, exclusive) {
      edit((p) => p.tracks.reduce((q, t) => {
        const want = exclusive ? t.id === id : t.id === id ? !t.target : !!t.target
        return !!t.target === want ? q : ops.setTrack(q, t.id, { target: want })
      }, p), `Targeting ${get().project?.tracks.find((t) => t.id === id)?.name ?? id}`)
    },
    toggleSyncLock() {
      edit((p) => ({ ...p, syncLock: p.syncLock === false }), (s) => (s.project?.syncLock === false ? 'Sync lock off' : 'Sync lock on'))
    },
    toggleAutoDelete() {
      const on = get().project?.autoDeleteEmpty !== true
      const before = get().project?.tracks.length ?? 0
      edit((p) => (on ? sweepEmptyTracks({ ...p, autoDeleteEmpty: true }) : { ...p, autoDeleteEmpty: false }),
        (s) => (on ? `Auto-delete empty tracks on${before > (s.project?.tracks.length ?? 0) ? ` (removed ${before - (s.project?.tracks.length ?? 0)} empty)` : ''}` : 'Auto-delete empty tracks off'))
    },
    markerAt(t, name) { edit((p) => ops.addMarker(p, t, name), `Marker at ${fmtTime(t)}`) },
    renameMarker(id, name) { edit((p) => ({ ...p, markers: p.markers.map((m) => (m.id === id ? { ...m, name } : m)) }), `Marker renamed to ${name}`) },
    removeMarker(id) { edit((p) => ops.removeMarker(p, id), 'Marker removed') }
  }
}

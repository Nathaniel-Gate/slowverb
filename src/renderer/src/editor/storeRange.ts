import { EDITOR } from '../config/editorKeys'
import { clipDur, type FadeCurve } from './model'
import * as ops from './ops'
import type { Ctx, RangeKeys, S } from './storeTypes'
import { fmtDur, fmtTime } from './timefmt'

const CURVE_NAMES: Record<FadeCurve, string> = { lin: 'linear', pow: 'equal power', log: 'log', s: 'S curve' }
const dbLabel = (db: number) => `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`

/** The range actions act on: the Range tool selection, else In to Out. tracks resolve to the range's own, else the targeted tracks (undefined = all). */
export function activeRange(s: S, targets: () => string[] | undefined): { a: number; b: number; tracks: string[] | undefined } | null {
  if (s.range && s.range.b > s.range.a) return { a: s.range.a, b: s.range.b, tracks: s.range.tracks ?? targets() }
  if (s.markIn !== null && s.markOut !== null && s.markOut > s.markIn) return { a: s.markIn, b: s.markOut, tracks: targets() }
  return null
}

/** Range, volume envelope, fade curve and "smart edit" actions (Resolve-style). */
export function rangeActions({ get, set, toast, edit, coalesce, targets }: Ctx): Pick<S, RangeKeys> {
  const need = () => get().project
  const range = () => { const r = activeRange(get(), targets); if (!r) toast('Select a range first (R tool, or I and O)'); return r }
  const clipsUnderPlayhead = (t: number) => (need()?.clips ?? []).filter((c) => t > c.start && t < c.start + clipDur(c) && (!targets() || targets()!.includes(c.track))).map((c) => c.id)
  const selOrHere = (t: number) => (get().selection.length ? get().selection : clipsUnderPlayhead(t))
  const trimSel = (edge: 'start' | 'end') => {
    const t = get().now(), sel = selOrHere(t); if (!sel.length) return toast('Select a clip first')
    edit((p) => ops.trimToPlayheadSel(p, sel, t, edge, false), `Trimmed ${edge} to ${fmtTime(t)}`, 'Playhead is outside the clip')
  }
  return {
    setRange: (r) => set({ range: r && r.b - r.a > EDITOR.edgeEps ? { a: Math.max(0, Math.min(r.a, r.b)), b: Math.max(r.a, r.b), tracks: r.tracks } : null }),
    muteRange() {
      const r = range(); if (!r) return
      edit((p) => ops.muteRange(p, r.a, r.b, r.tracks), `Muted ${fmtDur(r.b - r.a)}`, 'Nothing to mute there')
    },
    gainRangeDb(db) {
      const r = range(); if (!r) return
      const before = need(); coalesce(`rangegain:${r.a}:${r.b}`, (p) => ops.gainRange(p, r.a, r.b, db, r.tracks))
      toast(need() === before ? 'Nothing in that range' : `Range ${dbLabel(db)}`)
    },
    fadeRangeEdge(kind) {
      const r = range(); if (!r) return
      edit((p) => ops.fadeRange(p, r.a, r.b, kind, r.tracks), `Fade ${kind} over ${fmtDur(r.b - r.a)}`, 'Nothing in that range')
    },
    liftRangeSel() {
      const r = range(); if (!r) return
      edit((p) => ops.liftRange(p, r.a, r.b, r.tracks), `Lifted ${fmtDur(r.b - r.a)}`, 'Nothing in that range')
    },
    extractRangeSel() {
      const r = range(); if (!r) return
      if (edit((p) => ops.extractRange(p, r.a, r.b, r.tracks), `Extracted ${fmtDur(r.b - r.a)}`, 'Nothing in that range')) set({ range: null })
    },
    gainSelectedDb(db) {
      const sel = get().selection; if (!sel.length) return toast('Select a clip first')
      const k = 10 ** (db / 20)
      coalesce(`selgain:${sel.join()}`, (p) => p.clips.filter((c) => sel.includes(c.id)).reduce((q, c) => ops.patchClips(q, [c.id], { gain: Math.min(10 ** (EDITOR.gainMaxDb / 20), Math.max(0, c.gain * k)) }), p))
      toast(`Clip ${dbLabel(db)}`)
    },

    // The drag of a point is one undo step: edits of one clip's envelope inside the coalesce window share a history entry.
    setEnvPointAt(clipId, tClip, g, index) { coalesce(`env:${clipId}`, (p) => ops.setEnvPoint(p, clipId, tClip, g, index)) },
    removeEnvPointAt(clipId, index) { edit((p) => ops.removeEnvPoint(p, clipId, index), 'Envelope point removed') },
    clearEnvSelected() {
      const sel = get().selection; if (!sel.length) return toast('Select a clip first')
      edit((p) => sel.reduce((q, id) => ops.clearEnv(q, id), p), 'Envelope cleared', 'No envelope on the selection')
    },
    setFadeCurveSel(which, curve) {
      const sel = get().selection; if (!sel.length) return toast('Select a clip first')
      edit((p) => ops.setFadeCurve(p, sel, which, curve), `Fade ${which} curve: ${CURVE_NAMES[curve]}`, `Fade ${which} is already ${CURVE_NAMES[curve]}`)
    },

    extendEditToPlayhead() {
      const t = get().now()
      edit((p) => ops.extendEdit(p, t, targets()), `Extended edit to ${fmtTime(t)}`, 'No edit point to extend')
    },
    trimStartToPlayhead: () => trimSel('start'),
    trimEndToPlayhead: () => trimSel('end'),
    splitAtMarkers() {
      const ts = need()?.markers.map((m) => m.t) ?? []; if (!ts.length) return toast('No markers to cut at')
      edit((p) => ops.splitAtMany(p, ts), `Cut at ${ts.length} marker${ts.length === 1 ? '' : 's'}`, 'Markers are not on any clip')
    },
    setSmoothCuts(on) {
      if (need() && (need()!.smoothCuts !== false) === on) return toast(on ? 'Smooth cuts already on' : 'Smooth cuts already off')
      edit((p) => ({ ...p, smoothCuts: on }), on ? 'Smooth cuts on' : 'Smooth cuts off')
    }
  }
}

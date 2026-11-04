import { EDITOR } from '../config/editorKeys'
import { clipSpeed, projectEnd, type Project } from './model'
import * as ops from './ops'
import { detectSections, leadingTrailingSilence } from './sections'
import { activeRange } from './storeRange'
import type { AutoKeys, Ctx, S } from './storeTypes'

/** Source second -> timeline second through the first clip that plays it (null when no clip does). */
export function srcToTimeline(p: Project, src: string, t: number): number | null {
  const c = p.clips.find((x) => x.src === src && t >= x.srcIn && t < x.srcOut)
  return c ? c.start + (t - c.srcIn) / clipSpeed(c) : null
}

/** Analysis-driven edits: sections to markers, cut on the beat grid, trim silence. */
export function autoActions({ get, toast, edit, targets }: Ctx): Pick<S, AutoKeys> {
  return {
    async detectSectionsToMarkers() {
      const p = get().project, buf = p && get().buffers.get(p.song)
      if (!p || !buf) return toast('Song audio is not loaded yet')
      toast('Detecting sections...')
      await new Promise((r) => setTimeout(r, 0))   // let the toast paint before the analysis blocks the thread
      const heard = get().sound() ?? p   // map through the AUDIO clips (the Clips tab's slice holds none)
      const times = detectSections(buf).map((s) => srcToTimeline(heard, p.song, s.t)).filter((t): t is number => t !== null)
      if (!times.length) return toast('No clear sections found')
      let n = 0
      edit((q) => times.reduce((acc, t, i) => {
        if (acc.markers.some((m) => Math.abs(m.t - t) < EDITOR.sectionDupSec)) return acc
        n++; return ops.addMarker(acc, t, `Section ${i + 1}`)
      }, q), () => `Added ${n} section marker${n === 1 ? '' : 's'}`, 'Section markers already exist')
    },
    cutEveryBeatsAction(beats) {
      const p = get().project; if (!p) return
      if (!p.bpm) return toast('Set a BPM first (BPM panel)')
      const r = activeRange(get(), targets), from = r?.a ?? 0, to = r?.b ?? projectEnd(p)
      edit((q) => ops.cutEveryBeats(q, from, to, beats), `Cut every ${beats} beat${beats === 1 ? '' : 's'}${r ? ' in range' : ''}`, 'No beats to cut at')
    },
    trimSilenceSelected() {
      const { project: p, selection, buffers } = get(); if (!p) return
      const ids = selection.length ? selection : p.clips.map((c) => c.id)   // nothing selected = every clip
      let n = 0
      edit((q) => ids.reduce((acc, id) => {
        const c = acc.clips.find((x) => x.id === id), buf = c && buffers.get(c.src); if (!c || !buf) return acc
        const { start, end } = leadingTrailingSilence(buf, EDITOR.silenceDb)   // audible span in SOURCE seconds
        const a = Math.max(start, c.srcIn), b = Math.min(end, c.srcOut)
        if (b - a < 0.01 || (a - c.srcIn < 1e-3 && c.srcOut - b < 1e-3)) return acc
        const next = ops.trimEnds(acc, id, a, b); if (next !== acc) n++
        return next
      }, p), () => `Trimmed silence on ${n} clip${n === 1 ? '' : 's'}`, 'No silence at the clip ends')
    }
  }
}

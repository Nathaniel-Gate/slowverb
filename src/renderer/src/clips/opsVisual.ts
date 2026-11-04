import { CLIPS } from '../config/clips'
import { FIRST_VISUAL } from '../editor/kinds'
import { type Aspect, type Clip, type Project, type SourceInfo, type VisualFit } from '../editor/model'
import * as ops from '../editor/ops'

// Pure edits that only make sense for pictures. Everything else (move, trim, split, fades, crossfades...) is the editor's own ops.
export type VisualPatch = { fit?: VisualFit; zoom?: number; audio?: boolean }

const clampZoom = (z: number) => Math.min(CLIPS.zoomMax, Math.max(0, Number.isFinite(z) ? z : 0))
/** Fit / push-in / own-audio on the given visual clips. `audio` only applies to video clips. Same p when nothing changes. */
export function patchVisual(p: Project, ids: string[], patch: VisualPatch): Project {
  const want = new Set(ids), locked = new Set(p.tracks.filter((t) => t.lock).map((t) => t.id))
  let changed = false
  const clips = p.clips.map((c) => {
    const kind = p.sources[c.src]?.kind
    if (!want.has(c.id) || !kind || locked.has(c.track)) return c
    const next: Clip = { ...c }
    if (patch.fit !== undefined) next.fit = patch.fit
    if (patch.zoom !== undefined) { const z = clampZoom(patch.zoom); if (z) next.zoom = z; else delete next.zoom }
    if (patch.audio !== undefined && kind === 'video') { if (patch.audio) next.audio = true; else delete next.audio }
    if (JSON.stringify(next) === JSON.stringify(c)) return c
    changed = true; return next
  })
  return changed ? { ...p, clips } : p
}

/** Default timeline length of a new still: one bar at the song's BPM, else CLIPS.stillSec. */
export const stillLength = (bpm: number | null) => (bpm && bpm > 0 ? (CLIPS.stillBeats * 60) / bpm : CLIPS.stillSec)

/** Place a picture or video at t on a track (overwrite, or insert = push later clips right). Stills start mid-source so both ends can grow. */
export function placeMedia(p: Project, path: string, info: SourceInfo, t: number, track: string, mode: 'insert' | 'overwrite' = 'overwrite', len?: number): Project {
  if (!info.kind) return p
  const still = info.kind === 'image', dur = still ? CLIPS.stillSourceSec : info.duration
  const a = still ? CLIPS.stillInSec : 0, b = still ? a + (len ?? stillLength(p.bpm)) : Math.min(dur, len ?? dur)
  const withSrc: Project = { ...p, sources: { ...p.sources, [path]: { ...info, duration: dur } } }
  const clip = ops.clipFromSource(path, dur, a, b, track, 0)
  return mode === 'insert' ? ops.insertClips(withSrc, [{ ...clip, start: t }], t, track) : ops.pasteClips(withSrc, [clip], t, track)
}

/** The Clips tab's preview shape. */
export const setAspect = (p: Project, aspect: Aspect): Project => ((p.stage?.aspect ?? CLIPS.defaultAspect) === aspect ? p : { ...p, stage: { aspect } })

/** A slice's first visual track id (the Clips tab always has at least FIRST_VISUAL). */
export const firstVisualTrack = (p: Project) => p.tracks.find((t) => t.kind === 'visual')?.id ?? FIRST_VISUAL.id

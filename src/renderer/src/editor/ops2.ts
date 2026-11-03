import { MIN_CLIP, clipEnd, type Clip, type Project } from './model'
import { BEAT_MAX, EPS, REPEAT_MAX, clamp, finite, lockedIds, placeAll, settle, uid } from './clipmath'
import { pasteClips } from './opsEdit'
import { rippleTracks, shiftTracks, type RippleOpts } from './opsRange'

// Queries, beat grid, source clips, loop copies and 3-point insert. All pure.

const inTracks = (tracks?: string[]) => (c: Clip) => !tracks || tracks.includes(c.track)

/** Ids of clips overlapping timeline (a, b) on the tracks (all if not given). */
export function clipsInRange(p: Project, a: number, b: number, tracks?: string[]): string[] {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  return p.clips.filter(inTracks(tracks)).filter(c => c.start < hi - EPS && clipEnd(c) > lo + EPS).map(c => c.id)
}
/** Track select forward (A): clips under t or after it. */
export function clipsForward(p: Project, t: number, tracks?: string[]): string[] {
  return p.clips.filter(inTracks(tracks)).filter(c => clipEnd(c) > t + EPS).map(c => c.id)
}
/** Track select backward (Shift+A): clips under t or before it. */
export function clipsBackward(p: Project, t: number, tracks?: string[]): string[] {
  return p.clips.filter(inTracks(tracks)).filter(c => c.start < t - EPS).map(c => c.id)
}

/** Nearest clip start/end strictly before (dir -1) or after (dir 1) t, or null. */
export function nearestEditPoint(p: Project, t: number, dir: -1 | 1): number | null {
  if (!finite(t)) return null
  let best: number | null = null
  for (const c of p.clips) for (const e of [c.start, clipEnd(c)]) {
    if (dir > 0 ? e > t + EPS && (best === null || e < best) : e < t - EPS && (best === null || e > best)) best = e
  }
  return best
}

/** Beat times in [fromSec, toSec] from p.bpm and p.bpmOffset (never negative). [] without a bpm. */
export function beatGrid(p: Project, fromSec: number, toSec: number): number[] {
  if (!finite(p.bpm) || p.bpm <= 0 || !finite(fromSec) || !finite(toSec) || toSec < fromSec) return []
  const period = 60 / p.bpm, off = finite(p.bpmOffset) ? p.bpmOffset : 0
  const out: number[] = []
  for (let k = Math.ceil((Math.max(0, fromSec) - off) / period - 1e-9); out.length < BEAT_MAX; k++) {
    const t = off + k * period
    if (t > toSec + 1e-9) break
    if (t >= -1e-9) out.push(Math.max(0, t))
  }
  return out
}

/** A fresh clip from a source range (in/out clamped into the source and to MIN_CLIP), unity gain, no fades. */
export function clipFromSource(src: string, srcDuration: number, srcIn: number, srcOut: number, track: string, start: number): Clip {
  const dur = finite(srcDuration) && srcDuration > 0 ? srcDuration : 0
  const a = clamp(finite(srcIn) ? Math.min(srcIn, srcOut) : 0, 0, Math.max(0, dur - MIN_CLIP))
  const b = clamp(finite(srcOut) ? Math.max(srcIn, srcOut) : dur, a + MIN_CLIP, dur)
  return { id: uid('c', []), src, track, start: finite(start) ? Math.max(0, start) : 0, srcIn: a, srcOut: Math.max(a, b), gain: 1, fadeIn: 0, fadeOut: 0 }
}

/** Loop: `times` extra copies of the selection back to back after it (overwrite rule, capped at REPEAT_MAX). */
export function repeatClips(p: Project, ids: string[], times: number): Project {
  const want = new Set(ids), locked = lockedIds(p)
  const src = p.clips.filter(c => want.has(c.id) && !locked.has(c.track))
  const n = Math.min(Math.floor(times), REPEAT_MAX)
  if (!src.length || !finite(times) || n < 1) return p
  const a = Math.min(...src.map(c => c.start)), len = Math.max(...src.map(clipEnd)) - a
  if (len <= EPS) return p
  const taken = new Set(p.clips.map(c => c.id)), copies: Clip[] = []
  for (let k = 1; k <= n; k++) for (const c of src) {
    const id = uid('c', taken); taken.add(id)
    copies.push({ ...c, id, start: c.start + k * len })
  }
  return { ...p, clips: placeAll(p.clips, copies) }
}

/**
 * 3-point INSERT: open a space at `at` as long as the clips' span (splitting what crosses `at`, pushing later material
 * right on the destination tracks and, with sync lock, every unlocked track), then place the clips there (new ids).
 */
export function insertClips(p: Project, clips: Clip[], at: number, track?: string, opts?: RippleOpts): Project {
  if (!finite(at)) return p
  const t = Math.max(0, at)
  const trial = pasteClips({ ...p, clips: [] }, clips, t, track)
  if (!trial.clips.length) return p
  const len = Math.max(...trial.clips.map(clipEnd)) - t
  const gapped = { ...p, clips: shiftTracks(p.clips, rippleTracks(p, trial.clips.map(c => c.track), opts), t, len) }
  const out = pasteClips(gapped, clips, t, track)
  return out === gapped ? p : { ...out, clips: settle(out.clips) }
}

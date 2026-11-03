import { clipEnd, clipSpeed, type Clip, type Project } from './model'
import { BEAT_MAX, EPS, SLACK, finite, lockedIds, spanTooShort } from './clipmath'
import { splitAt } from './opsEdit'
import { targetTracks } from './opsRange'
import { rollEdit } from './opsSpeed'
import { rippleTrim, trimClip } from './opsTrim'

// Resolve-style "smart" edits: extend edit (E), trim start/end to playhead, multi-cut, beat cuts, silence trim. All pure.

type Cand = { t: number; roll: [string, string] } | { t: number; edge: 'in' | 'out'; id: string }
const byStart = (a: Clip, b: Clip) => a.start - b.start || clipEnd(a) - clipEnd(b)

/** Every edit point on the tracks: a cut between two touching (or crossfaded) clips is one roll point, other edges are lone. */
function editCandidates(p: Project, tracks: Set<string>): Cand[] {
  const out: Cand[] = []
  for (const tr of tracks) {
    const on = p.clips.filter(c => c.track === tr).sort(byStart), paired = new Set<string>()
    for (let i = 0; i + 1 < on.length; i++) {
      const l = on[i], r = on[i + 1], ov = clipEnd(l) - r.start
      if (ov < -SLACK || clipEnd(r) <= clipEnd(l) + SLACK) continue
      out.push({ t: ov > SLACK ? (r.start + clipEnd(l)) / 2 : r.start, roll: [l.id, r.id] })
      paired.add(`${l.id}:out`); paired.add(`${r.id}:in`)
    }
    for (const c of on) {
      if (!paired.has(`${c.id}:in`)) out.push({ t: c.start, edge: 'in', id: c.id })
      if (!paired.has(`${c.id}:out`)) out.push({ t: clipEnd(c), edge: 'out', id: c.id })
    }
  }
  return out
}

/**
 * Resolve E: move the edit point nearest to t (on the tracks, else targeted, else all) to t, on every track that has an
 * edit there. A cut between two clips rolls; a lone out edge ripples when sync lock is on (later material follows), else
 * trims; a lone in edge trims (so the clip start lands on t).
 */
export function extendEdit(p: Project, t: number, tracks?: string[]): Project {
  if (!finite(t)) return p
  const cands = editCandidates(p, targetTracks(p, tracks))
  if (!cands.length) return p
  const best = cands.reduce((m, c) => (Math.abs(c.t - t) < Math.abs(m.t - t) ? c : m))
  if (Math.abs(best.t - t) <= EPS) return p
  const hit = cands.filter(c => Math.abs(c.t - best.t) <= SLACK)
  let q = p, rippled = false
  for (const c of hit) if ('roll' in c) q = rollEdit(q, c.roll[0], c.roll[1], t)
  for (const c of hit) {
    if ('roll' in c || !q.clips.some(x => x.id === c.id)) continue
    if (c.edge === 'out' && !rippled && q.syncLock !== false) { q = rippleTrim(q, c.id, 'out', t); rippled = true }
    else q = trimClip(q, c.id, c.edge, t)
  }
  return q
}

/**
 * ⇧[ / ⇧]: on each selected clip that t falls inside, cut its start ('start') or end ('end') to t. ripple: later
 * material follows (sync-lock aware for one clip; with several clips each ripples only its own track, so tracks are not
 * shifted twice). Clips t is not inside are skipped.
 */
export function trimToPlayheadSel(p: Project, ids: string[], t: number, edge: 'start' | 'end', ripple: boolean): Project {
  if (!finite(t)) return p
  const locked = lockedIds(p)
  const inside = (q: Project, id: string) => q.clips.find(c => c.id === id && !locked.has(c.track) && c.start < t - EPS && clipEnd(c) > t + EPS)
  const list = [...new Set(ids)].filter(id => inside(p, id))
  if (!list.length) return p
  const opts = list.length > 1 ? { syncLock: false, tracks: [] } : undefined, e = edge === 'start' ? 'in' : 'out'
  return list.reduce((q, id) => (!inside(q, id) ? q : ripple ? rippleTrim(q, id, e, t, opts) : trimClip(q, id, e, t)), p)
}

/** Cut every unlocked clip at each time in ts (used by detect sections, markers, beat cuts). Same p if nothing was cut. */
export function splitAtMany(p: Project, ts: number[]): Project {
  const uniq = [...new Set(ts.filter(finite))].sort((a, b) => a - b)
  return uniq.reduce((q, t) => splitAt(q, t), p)
}

/** Cut at every `beats` beats of the p.bpm / p.bpmOffset grid inside [from, to]. Same p without a bpm. */
export function cutEveryBeats(p: Project, from: number, to: number, beats: number): Project {
  if (!finite(p.bpm) || p.bpm <= 0 || !finite(from) || !finite(to) || !finite(beats) || beats <= 0) return p
  const lo = Math.max(0, Math.min(from, to)), hi = Math.max(from, to)
  const step = (60 / p.bpm) * beats, off = finite(p.bpmOffset) ? p.bpmOffset : 0, ts: number[] = []
  for (let k = Math.ceil((lo - off) / step - 1e-9); ts.length < BEAT_MAX; k++) {
    const x = off + k * step
    if (x > hi + 1e-9) break
    if (x >= 0) ts.push(x)
  }
  return splitAtMany(p, ts)
}

/**
 * Keep only source seconds [startSec, endSec] of the clip (silence trimming). Clamped to what the clip already uses; the
 * kept audio stays where it was on the timeline (no ripple), fades kept. Same p if nothing to trim or too short a result.
 */
export function trimEnds(p: Project, clipId: string, startSec: number, endSec: number): Project {
  const c = p.clips.find(x => x.id === clipId)
  if (!c || lockedIds(p).has(c.track) || !finite(startSec) || !finite(endSec)) return p
  const a = Math.max(c.srcIn, Math.min(startSec, endSec)), b = Math.min(c.srcOut, Math.max(startSec, endSec)), sp = clipSpeed(c)
  if (spanTooShort(b - a, sp)) return p
  let q = p
  if (b < c.srcOut - EPS) q = trimClip(q, c.id, 'out', c.start + (b - c.srcIn) / sp)
  if (a > c.srcIn + EPS) q = trimClip(q, c.id, 'in', c.start + (a - c.srcIn) / sp)
  return q
}

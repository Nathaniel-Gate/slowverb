import { clipEnd, type Clip, type Project } from './model'
import { EPS, SLACK, clearRange, finite, lockedIds, piece, settle, uid } from './clipmath'
import { trimClip } from './opsTrim'

// Ripple primitives (sync lock) and In/Out range edits: lift, extract, close gaps, Q/W trims. All pure.
export type RippleOpts = { tracks?: string[]; syncLock?: boolean }
export type Gap = { start: number; end: number }

/**
 * Tracks a ripple shifts: the affected tracks, plus opts.tracks if given, else plus every unlocked track when sync lock
 * is on (opts.syncLock, falling back to p.syncLock, default true). Locked tracks never shift.
 */
export function rippleTracks(p: Project, affected: Iterable<string>, opts?: RippleOpts): Set<string> {
  const locked = lockedIds(p), all = p.tracks.map(t => t.id)
  const sync = opts?.syncLock ?? p.syncLock !== false
  const extra = opts?.tracks ?? (sync ? all : [])
  return new Set([...affected, ...extra].filter(id => all.includes(id) && !locked.has(id)))
}

/** Tracks a range op works on: the given ones, else targeted tracks, else every track. Locked tracks dropped. */
export function targetTracks(p: Project, tracks?: string[]): Set<string> {
  const locked = lockedIds(p)
  const pool = tracks ?? (p.tracks.some(t => t.target) ? p.tracks.filter(t => t.target).map(t => t.id) : p.tracks.map(t => t.id))
  return new Set(pool.filter(id => p.tracks.some(t => t.id === id) && !locked.has(id)))
}

/** On `track`: delete timeline [a, b] (cutting clips that cross it) and pull everything after left by b - a. */
export function removeSpan(clips: Clip[], track: string, a: number, b: number): Clip[] {
  const len = b - a
  if (!(len > EPS)) return clips
  const taken = new Set(clips.map(c => c.id))
  return clips.flatMap(c => {
    const s = c.start, e = clipEnd(c)
    if (c.track !== track || e <= a + EPS) return [c]
    if (s >= b - EPS) return [{ ...c, start: Math.max(0, s - len) }]
    const left = s < a - EPS ? piece(c, s, a, c.id) : null
    const rid = left ? uid('c', taken) : c.id
    taken.add(rid)
    const right = e > b + EPS ? piece(c, b, e, rid) : null
    return [...(left ? [left] : []), ...(right ? [{ ...right, start: a }] : [])]
  })
}

/** On `track`: open an empty span of `len` at t, splitting a clip that crosses t and pushing everything later right. */
export function insertSpan(clips: Clip[], track: string, t: number, len: number): Clip[] {
  if (!(len > EPS)) return clips
  const taken = new Set(clips.map(c => c.id))
  return clips.flatMap(c => {
    const s = c.start, e = clipEnd(c)
    if (c.track !== track || e <= t + EPS) return [c]
    if (s >= t - EPS) return [{ ...c, start: s + len }]
    const left = piece(c, s, t, c.id), rid = uid('c', taken)
    taken.add(rid)
    const right = piece(c, t, e, rid)
    if (!left || !right) return [left ? c : { ...c, start: s + len }]   // a sliver would vanish: move the clip whole instead
    return [left, { ...right, start: t + len }]
  })
}

/** Apply removeSpan / insertSpan (delta < 0 / > 0) at `at` on several tracks. */
export function shiftTracks(clips: Clip[], tracks: Iterable<string>, at: number, delta: number): Clip[] {
  let out = clips
  for (const tr of tracks) out = delta < 0 ? removeSpan(out, tr, at, at - delta) : insertSpan(out, tr, at, delta)
  return out
}

/** Gaps on a track, including a leading one from 0. The open space after the last clip is not a gap. */
export function gapsOf(p: Project, trackId: string): Gap[] {
  const on = p.clips.filter(c => c.track === trackId).sort((a, b) => a.start - b.start)
  const out: Gap[] = []
  let end = 0
  for (const c of on) {
    if (c.start > end + SLACK) out.push({ start: end, end: c.start })
    end = Math.max(end, clipEnd(c))
  }
  return out
}

const norm = (a: number, b: number): [number, number] | null =>
  finite(a) && finite(b) && Math.abs(b - a) > EPS ? [Math.max(0, Math.min(a, b)), Math.max(a, b)] : null

/** Remove [a, b] on the tracks, leaving a gap. */
export function liftRange(p: Project, a: number, b: number, tracks?: string[]): Project {
  const r = norm(a, b)
  if (!r || r[1] - r[0] <= EPS) return p
  let clips = p.clips
  for (const tr of targetTracks(p, tracks)) clips = clearRange(clips, tr, r[0], r[1])
  return clips.length === p.clips.length && clips.every((c, i) => c === p.clips[i]) ? p : { ...p, clips: settle(clips) }
}

/** Remove [a, b] on the tracks and pull later material left by b - a (on every unlocked track too when sync lock is on). */
export function extractRange(p: Project, a: number, b: number, tracks?: string[]): Project {
  const r = norm(a, b)
  if (!r || r[1] - r[0] <= EPS) return p
  const tr = targetTracks(p, tracks)
  if (!tr.size) return p
  const clips = shiftTracks(p.clips, rippleTracks(p, tr), r[0], r[0] - r[1])
  return clips.every((c, i) => c === p.clips[i]) && clips.length === p.clips.length ? p : { ...p, clips: settle(clips) }
}

/** Close the gap containing t on a track. With sync lock, refused unless that span is empty on every other shifted track. */
export function closeGap(p: Project, trackId: string, t: number, opts?: RippleOpts): Project {
  if (!finite(t) || lockedIds(p).has(trackId)) return p
  const g = gapsOf(p, trackId).find(x => t >= x.start - EPS && t <= x.end + EPS)
  if (!g) return p
  const tracks = rippleTracks(p, [trackId], opts)
  const blocked = p.clips.some(c => c.track !== trackId && tracks.has(c.track) && c.start < g.end - SLACK && clipEnd(c) > g.start + SLACK)
  if (blocked) return p
  return { ...p, clips: settle(shiftTracks(p.clips, tracks, g.start, g.start - g.end)) }
}

/** Compact one track (sync-lock aware, blocked gaps skipped) or, with no trackId, every unlocked track on its own. */
export function closeAllGaps(p: Project, trackId?: string): Project {
  const ids = trackId !== undefined ? [trackId] : p.tracks.map(t => t.id)
  let q = p
  for (const id of ids) {
    for (const g of gapsOf(q, id).reverse()) q = closeGap(q, id, (g.start + g.end) / 2, trackId !== undefined ? undefined : { syncLock: false })
  }
  return q
}

/**
 * Q / W. which = 'prevTail': remove from the previous edit point up to t (Premiere Q); 'nextHead': from t to the next
 * edit point (W). Acts on clips under t on the tracks (else targeted, else all). ripple = pull later material left
 * (sync-lock aware, using the nearest edit point so tracks stay in sync); otherwise plain trims (Alt+Q / Alt+W).
 */
export function trimToPlayhead(p: Project, t: number, which: 'prevTail' | 'nextHead', ripple: boolean, tracks?: string[]): Project {
  if (!finite(t)) return p
  const tr = targetTracks(p, tracks)
  const under = p.clips.filter(c => tr.has(c.track) && c.start < t - EPS && clipEnd(c) > t + EPS)
  if (!under.length) return p
  const prev = which === 'prevTail'
  if (!ripple) return under.reduce((q, c) => trimClip(q, c.id, prev ? 'in' : 'out', t), p)
  const edge = prev ? Math.max(...under.map(c => c.start)) : Math.min(...under.map(clipEnd))
  return prev ? extractRange(p, edge, t, [...tr]) : extractRange(p, t, edge, [...tr])
}

import { clipEnd, type Clip, type Project } from './model'
import { EPS, SLACK, SPEED_MAX, SPEED_MIN, clamp, cleanClip, finite, fitFades, lockedIds, piece, placeAll, settle, spanTooShort, trackIndex, uid } from './clipmath'
import { removeSpan, rippleTracks, type RippleOpts } from './opsRange'

// Clip-level edits. All pure: they return a NEW Project, or the SAME object when nothing changed.
// Locked tracks are read-only: clips on them are skipped by every op here.

const byId = (p: Project, ids: string[]) => {
  const want = new Set(ids), locked = lockedIds(p)
  return p.clips.filter(c => want.has(c.id) && !locked.has(c.track))
}

/** Split clips under t. ids given: only those; else every clip on an unlocked track. No-op at an edge. */
export function splitAt(p: Project, t: number, ids?: string[]): Project {
  if (!finite(t)) return p
  const locked = lockedIds(p), only = ids ? new Set(ids) : null, taken = new Set(p.clips.map(c => c.id))
  let changed = false
  const clips = p.clips.flatMap(c => {
    const s = c.start, e = clipEnd(c)
    if (locked.has(c.track) || (only && !only.has(c.id)) || t <= s + EPS || t >= e - EPS) return [c]
    const rid = uid('c', taken), l = piece(c, s, t, c.id), r = piece(c, t, e, rid)
    if (!l || !r) return [c]
    taken.add(rid); changed = true
    return [l, r]
  })
  return changed ? { ...p, clips: settle(clips) } : p
}

export function deleteClips(p: Project, ids: string[]): Project {
  const gone = new Set(byId(p, ids).map(c => c.id))
  return gone.size ? { ...p, clips: p.clips.filter(c => !gone.has(c.id)) } : p
}

/** Subtract the [s, e] intervals in `cover` from [a, b]; pieces shorter than SLACK dropped. */
function minus(a: number, b: number, cover: [number, number][]): [number, number][] {
  let parts: [number, number][] = [[a, b]]
  for (const [s, e] of cover) parts = parts.flatMap(([x, y]) => (e <= x || s >= y ? [[x, y]] : [[x, Math.min(y, s)], [Math.max(x, e), y]]) as [number, number][])
  return parts.filter(([x, y]) => y - x > SLACK)
}

const merge = (list: [number, number][]) => {
  const out: [number, number][] = []
  for (const [a, b] of [...list].sort((x, y) => x[0] - y[0])) {
    const last = out[out.length - 1]
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/**
 * Delete, then close the space they leave: later clips on the same tracks shift left by the (merged) emptied span before
 * them. Space still covered by a surviving crossfade partner is not removed. With sync lock (opts, else p.syncLock,
 * default on) every other unlocked track loses the union of those spans too, so tracks stay in sync.
 */
export function rippleDelete(p: Project, ids: string[], opts?: RippleOpts): Project {
  const gone = byId(p, ids)
  if (!gone.length) return p
  const goneIds = new Set(gone.map(c => c.id))
  let clips = p.clips.filter(c => !goneIds.has(c.id))
  const spans = new Map<string, [number, number][]>()
  for (const c of gone) {
    const cover = clips.filter(x => x.track === c.track).map(x => [x.start, clipEnd(x)] as [number, number])
    spans.set(c.track, [...(spans.get(c.track) ?? []), ...minus(c.start, clipEnd(c), cover)])
  }
  const union = merge([...spans.values()].flat())
  for (const tr of rippleTracks(p, spans.keys(), opts)) {
    for (const [a, b] of merge(spans.get(tr) ?? union).reverse()) clips = removeSpan(clips, tr, a, b)
  }
  return { ...p, clips: settle(clips) }
}

/** Move clips by dt (clamped so none starts before 0) and trackShift (clamped into range; a locked destination refuses). Overwrites what it lands on. */
export function moveClips(p: Project, ids: string[], dt: number, trackShift = 0): Project {
  const moving = byId(p, ids)
  if (!moving.length || !finite(dt) || !finite(trackShift)) return p
  const idx = moving.map(c => trackIndex(p, c.track))
  if (idx.some(i => i < 0)) return p
  const shift = clamp(Math.round(trackShift), -Math.min(...idx), p.tracks.length - 1 - Math.max(...idx))
  const d = Math.max(dt, -Math.min(...moving.map(c => c.start)))
  if (d === 0 && shift === 0) return p
  const locked = lockedIds(p)
  if (shift !== 0 && moving.some(c => locked.has(p.tracks[trackIndex(p, c.track) + shift].id))) return p
  const movedIds = new Set(moving.map(c => c.id))
  const moved = moving.map(c => ({ ...c, start: c.start + d, track: p.tracks[trackIndex(p, c.track) + shift].id }))
  return { ...p, clips: placeAll(p.clips.filter(c => !movedIds.has(c.id)), moved) }
}

/** Copies of ids offset by dt (clamped >= 0), new ids, overwrite rule. dt = 0 is a no-op. */
export function duplicateClips(p: Project, ids: string[], dt: number): Project {
  const src = byId(p, ids)
  if (!src.length || !finite(dt)) return p
  const d = Math.max(dt, -Math.min(...src.map(c => c.start)))
  if (d === 0) return p
  const taken = new Set(p.clips.map(c => c.id))
  const copies = src.map(c => { const id = uid('c', taken); taken.add(id); return { ...c, id, start: c.start + d } })
  return { ...p, clips: placeAll(p.clips, copies) }
}

/**
 * Paste clips so the earliest lands at `at`, keeping relative offsets, with new ids. Clips whose source is unknown to
 * the project are dropped; src bounds are clamped. `track` = where the earliest clip's track goes; other tracks keep their
 * index offset from it (clamped into range). Without `track` each clip keeps its own track (missing -> first track).
 */
export function pasteClips(p: Project, clips: Clip[], at: number, track?: string): Project {
  if (!finite(at) || !p.tracks.length) return p
  const valid = clips.flatMap(c => {
    const src = p.sources[c.src]
    if (!src || !finite(c.start) || !finite(c.srcIn) || !finite(c.srcOut)) return []
    const srcIn = clamp(c.srcIn, 0, src.duration), srcOut = clamp(c.srcOut, 0, src.duration)
    const speed = c.speed === undefined ? undefined : finite(c.speed) && c.speed > 0 ? clamp(c.speed, SPEED_MIN, SPEED_MAX) : 1
    return spanTooShort(srcOut - srcIn, speed ?? 1) ? [] : [{ ...c, ...(speed === undefined ? {} : { speed }), srcIn, srcOut, gain: finite(c.gain) && c.gain >= 0 ? c.gain : 1, fadeIn: Math.max(0, c.fadeIn || 0), fadeOut: Math.max(0, c.fadeOut || 0) }]
  }).sort((a, b) => a.start - b.start)
  if (!valid.length) return p
  let offset = 0
  if (track !== undefined) {
    const to = trackIndex(p, track)
    if (to < 0) return p
    offset = to - Math.max(0, trackIndex(p, valid[0].track))
  }
  const locked = lockedIds(p), taken = new Set(p.clips.map(c => c.id)), origin = Math.max(0, at) - valid[0].start
  const placed: Clip[] = []
  for (const c of valid) {
    const i = trackIndex(p, c.track)
    const dest = p.tracks[track !== undefined ? clamp((i < 0 ? 0 : i) + offset, 0, p.tracks.length - 1) : Math.max(0, i)]
    if (locked.has(dest.id)) continue
    const id = uid('c', taken); taken.add(id)
    placed.push(fitFades(cleanClip({ ...c, id, track: dest.id, start: c.start + origin })))
  }
  return placed.length ? { ...p, clips: placeAll(p.clips, placed) } : p
}

import { clipEnd, type Clip, type Project } from './model'
import { EPS, clamp, finite, fitFades, lockedIds, piece, placeAll, tooShort, trackIndex, uid } from './clipmath'

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
    if (locked.has(c.track) || (only && !only.has(c.id)) || t <= s + EPS || t >= e - EPS || tooShort(t - s) || tooShort(e - t)) return [c]
    const rid = uid('c', taken); taken.add(rid); changed = true
    return [piece(c, s, t, c.id)!, piece(c, t, e, rid)!]
  })
  return changed ? { ...p, clips } : p
}

export function deleteClips(p: Project, ids: string[]): Project {
  const gone = new Set(byId(p, ids).map(c => c.id))
  return gone.size ? { ...p, clips: p.clips.filter(c => !gone.has(c.id)) } : p
}

/** Delete, then close the gap: later clips on the same tracks shift left by the (merged) removed span before them. */
export function rippleDelete(p: Project, ids: string[]): Project {
  const gone = byId(p, ids)
  if (!gone.length) return p
  const goneIds = new Set(gone.map(c => c.id))
  const spans = new Map<string, [number, number][]>()   // per track, merged, sorted
  for (const c of [...gone].sort((a, b) => a.start - b.start)) {
    const list = spans.get(c.track) ?? []
    const last = list[list.length - 1]
    if (last && c.start <= last[1] + EPS) last[1] = Math.max(last[1], clipEnd(c))
    else list.push([c.start, clipEnd(c)])
    spans.set(c.track, list)
  }
  const clips = p.clips.filter(c => !goneIds.has(c.id)).map(c => {
    const shift = (spans.get(c.track) ?? []).reduce((n, [a, b]) => (b <= c.start + EPS ? n + (b - a) : n), 0)
    return shift > 0 ? { ...c, start: Math.max(0, c.start - shift) } : c
  })
  return { ...p, clips }
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
    return tooShort(srcOut - srcIn) ? [] : [{ ...c, srcIn, srcOut, gain: finite(c.gain) && c.gain >= 0 ? c.gain : 1, fadeIn: Math.max(0, c.fadeIn || 0), fadeOut: Math.max(0, c.fadeOut || 0) }]
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
    placed.push(fitFades({ ...c, id, track: dest.id, start: c.start + origin }))
  }
  return placed.length ? { ...p, clips: placeAll(p.clips, placed) } : p
}

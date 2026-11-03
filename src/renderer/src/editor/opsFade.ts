import { clipDur, clipEnd, clipSpeed, type Clip, type Project } from './model'
import { EPS, SLACK, clamp, finite, lockedIds, reEnv, settle, xfadeOk } from './clipmath'

// Clip property patches, fades and crossfades. All pure.
export type ClipPatch = Partial<Pick<Clip, 'gain' | 'fadeIn' | 'fadeOut' | 'name' | 'label' | 'disabled'>>
type FadeKey = 'gain' | 'fadeIn' | 'fadeOut'

/** Overlap of c with its crossfade neighbours on the track: [before (head), after (tail)]. */
function overlaps(p: Project, c: Clip): [number, number] {
  let head = 0, tail = 0
  for (const x of p.clips) {
    if (x.track !== c.track || x.id === c.id) continue
    const before = x.start < c.start || (x.start === c.start && clipEnd(x) <= clipEnd(c))
    if (before) head = Math.max(head, clipEnd(x) - c.start)
    else tail = Math.max(tail, clipEnd(c) - x.start)
  }
  return [head, tail]
}

/**
 * Patched copy of c, or c itself if nothing changes. Fades clamp so fadeIn + fadeOut <= duration (a patched fade is
 * clamped against the OTHER fade as it stands; if both are patched fadeIn wins) and never below an existing crossfade
 * overlap, so a crossfade stays legal.
 */
function patchOne(p: Project, c: Clip, patch: ClipPatch): Clip {
  const d = clipDur(c), has = (k: FadeKey) => finite(patch[k])
  const [head, tail] = overlaps(p, c)
  const gain = has('gain') ? Math.max(0, patch.gain!) : c.gain
  const fadeIn = has('fadeIn') ? clamp(patch.fadeIn!, Math.max(0, head), (has('fadeOut') ? d - Math.max(0, tail) : d - c.fadeOut)) : c.fadeIn
  const fadeOut = has('fadeOut') ? clamp(patch.fadeOut!, Math.max(0, tail), d - fadeIn) : c.fadeOut
  const next: Clip = { ...c, gain, fadeIn, fadeOut }
  if (typeof patch.name === 'string') next.name = patch.name
  if (typeof patch.label === 'string') next.label = patch.label
  if (typeof patch.disabled === 'boolean') next.disabled = patch.disabled
  const keys = ['gain', 'fadeIn', 'fadeOut', 'name', 'label', 'disabled'] as const
  return keys.some(k => next[k] !== c[k]) ? next : c
}

export function patchClips(p: Project, ids: string[], patch: ClipPatch): Project {
  const want = new Set(ids), locked = lockedIds(p)
  let changed = false
  const clips = p.clips.map(c => {
    if (!want.has(c.id) || locked.has(c.track)) return c
    const n = patchOne(p, c, patch)
    if (n !== c) changed = true
    return n
  })
  return changed ? { ...p, clips: settle(clips) } : p
}

function pair(p: Project, leftId: string, rightId: string): { l: Clip; r: Clip } | null {
  const l = p.clips.find(c => c.id === leftId), r = p.clips.find(c => c.id === rightId)
  if (!l || !r || l === r || l.track !== r.track || lockedIds(p).has(l.track) || !p.sources[l.src] || !p.sources[r.src]) return null
  return { l, r }
}

/** Undo a crossfade: cut at the middle of the overlap, both fades across the cut set to 0. Same p if they do not overlap. */
export function removeCrossfade(p: Project, leftId: string, rightId: string): Project {
  const pr = pair(p, leftId, rightId)
  if (!pr) return p
  const { l, r } = pr, ov = clipEnd(l) - r.start
  if (ov <= SLACK || r.start < l.start) return p
  const m = (r.start + clipEnd(l)) / 2, sl = clipSpeed(l), sr = clipSpeed(r)
  const nl: Clip = reEnv(l, { ...l, srcOut: l.srcIn + (m - l.start) * sl, fadeOut: 0 })
  const nr: Clip = reEnv(r, { ...r, start: m, srcIn: r.srcIn + (m - r.start) * sr, fadeIn: 0 })
  return { ...p, clips: settle(p.clips.map(c => (c.id === l.id ? nl : c.id === r.id ? nr : c))) }
}

/**
 * Crossfade two adjacent clips on one track: each extends into its hidden source by h (centred on the cut) so they
 * overlap by 2h, with fadeOut/fadeIn = 2h. h = dur/2 clamped to the available source handles, timeline 0 and the
 * clips' other fades. An existing crossfade is replaced. Same p if impossible.
 */
export function applyCrossfade(p: Project, leftId: string, rightId: string, dur: number): Project {
  let base = p, pr = pair(p, leftId, rightId)
  if (!pr || !finite(dur) || dur <= 0) return p
  if (clipEnd(pr.l) - pr.r.start > SLACK && xfadeOk(pr.l, pr.r)) { base = removeCrossfade(p, leftId, rightId); pr = pair(base, leftId, rightId)! }
  const { l, r } = pr, cut = r.start
  if (Math.abs(clipEnd(l) - cut) > SLACK) return p
  const sl = clipSpeed(l), sr = clipSpeed(r)
  const h = Math.min(dur / 2, (base.sources[l.src].duration - l.srcOut) / sl, r.srcIn / sr, cut,
    clipDur(l) - l.fadeIn, clipDur(r) - r.fadeOut)
  if (!(h > EPS)) return p
  const nl: Clip = reEnv(l, { ...l, srcOut: Math.min(base.sources[l.src].duration, l.srcOut + h * sl), fadeOut: 2 * h })
  const nr: Clip = reEnv(r, { ...r, start: cut - h, srcIn: Math.max(0, r.srcIn - h * sr), fadeIn: 2 * h })
  return { ...base, clips: settle(base.clips.map(c => (c.id === l.id ? nl : c.id === r.id ? nr : c))) }
}

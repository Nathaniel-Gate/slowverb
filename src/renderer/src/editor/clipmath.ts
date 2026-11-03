import { clipDur, clipEnd, clipSpeed, MIN_CLIP, type Clip, type Project } from './model'

// Shared maths for the pure edit ops. Tunables live here, not inline.
export const EPS = 1e-9          // timeline times closer than this are "the same instant"
export const LEN_EPS = 1e-9      // slack when comparing a length against MIN_CLIP
export const SLACK = 1e-6        // float slack used by validate() and settle() for overlap checks
export const HISTORY_CAP = 200
export const SPEED_MIN = 0.25, SPEED_MAX = 4   // clip playback rate limits
export const REPEAT_MAX = 64                   // most copies repeatClips will make in one go
export const BEAT_MAX = 100000                  // most grid lines beatGrid returns

const rand = () => Math.random().toString(36).slice(2, 10)
export function uid(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  let id = prefix + rand()
  while (used.has(id)) id = prefix + rand()
  return id
}

export const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)
export const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
export const tooShort = (len: number) => len < MIN_CLIP - LEN_EPS
export const lockedIds = (p: Project) => new Set(p.tracks.filter(t => t.lock).map(t => t.id))
export const trackIndex = (p: Project, id: string) => p.tracks.findIndex(t => t.id === id)
/** Shortest legal TIMELINE length for c: both the timeline length and the source span must reach MIN_CLIP. */
export const minDur = (c: Clip) => MIN_CLIP * Math.max(1, 1 / clipSpeed(c))
/** A source span that is too short either as source seconds or as timeline seconds at this speed. */
export const spanTooShort = (span: number, speed: number) => tooShort(span) || tooShort(span / speed)

/** Clamp fades so fadeIn + fadeOut <= duration (fadeIn wins, fadeOut gets what is left). */
export function fitFades(c: Clip): Clip {
  const d = clipDur(c)
  const fadeIn = clamp(c.fadeIn, 0, d), fadeOut = clamp(c.fadeOut, 0, d - fadeIn)
  return fadeIn === c.fadeIn && fadeOut === c.fadeOut ? c : { ...c, fadeIn, fadeOut }
}

/** The part of clip c that sits on timeline [from, to] (from/to inside the clip). Fades only survive on uncut ends. Speed aware. */
export function piece(c: Clip, from: number, to: number, id: string): Clip | null {
  const cs = c.start, ce = clipEnd(c), sp = clipSpeed(c)
  const cutHead = from > cs + EPS, cutTail = to < ce - EPS
  const srcIn = cutHead ? c.srcIn + (from - cs) * sp : c.srcIn
  const srcOut = cutTail ? c.srcIn + (to - cs) * sp : c.srcOut
  if (spanTooShort(srcOut - srcIn, sp)) return null
  return fitFades({ ...c, id, start: cutHead ? from : cs, srcIn, srcOut, fadeIn: cutHead ? 0 : c.fadeIn, fadeOut: cutTail ? 0 : c.fadeOut })
}

/** Earlier clip a and later clip b may overlap only as an explicit crossfade: overlap <= min(a.fadeOut, b.fadeIn). */
export const xfadeOk = (a: Clip, b: Clip) => clipEnd(a) - b.start <= Math.min(a.fadeOut, b.fadeIn) + SLACK
const byStart = (a: Clip, b: Clip) => a.start - b.start || clipEnd(a) - clipEnd(b)

/**
 * First illegal overlap in `on` (one track, sorted by start then end): returns [earlier, later] indexes, or null.
 * Legal: each clip overlaps at most its immediate predecessor, and only as a crossfade.
 */
export function firstBadOverlap(on: Clip[]): [number, number] | null {
  let maxEnd = -Infinity
  for (let i = 1; i < on.length; i++) {
    if (i >= 2) maxEnd = Math.max(maxEnd, clipEnd(on[i - 2]))
    if (maxEnd > on[i].start + SLACK) {
      for (let j = 0; j < i - 1; j++) if (clipEnd(on[j]) > on[i].start + SLACK) return [j, i]
    }
    const ov = clipEnd(on[i - 1]) - on[i].start
    if (ov > SLACK && !xfadeOk(on[i - 1], on[i])) return [i - 1, i]
  }
  return null
}

/** Safety net after every op: resolve any illegal same-track overlap by trimming the EARLIER clip (later wins). Same array if clean. */
export function settle(clips: Clip[]): Clip[] {
  let out = clips
  for (const track of new Set(clips.map(c => c.track))) {
    let on = out.filter(c => c.track === track).sort(byStart)
    let changed = false
    for (let guard = 0; guard < 10000; guard++) {
      const bad = firstBadOverlap(on)
      if (!bad) break
      const [j, i] = bad, a = on[j], cut = on[i].start
      const kept = cut > a.start + EPS ? piece(a, a.start, cut, a.id) : null
      on = (kept ? on.map((c, k) => (k === j ? kept : c)) : on.filter((_, k) => k !== j)).sort(byStart)
      changed = true
    }
    if (changed) out = [...out.filter(c => c.track !== track), ...on]
  }
  return out
}

/**
 * Overwrite semantics: make timeline range [s, e] on `track` empty by trimming, removing or splitting
 * whatever sits there. Clips whose id is in `skip` are left alone. Returns a new array.
 */
export function clearRange(clips: Clip[], track: string, s: number, e: number, skip: ReadonlySet<string> = new Set()): Clip[] {
  const out: Clip[] = []
  const taken = new Set(clips.map(c => c.id))
  for (const c of clips) {
    const cs = c.start, ce = clipEnd(c)
    if (c.track !== track || skip.has(c.id) || ce <= s + EPS || cs >= e - EPS) { out.push(c); continue }
    const left = cs < s - EPS ? piece(c, cs, s, c.id) : null
    const rid = left ? uid('c', taken) : c.id
    const right = ce > e + EPS ? piece(c, e, ce, rid) : null
    if (right && left) taken.add(rid)
    if (left) out.push(left)
    if (right) out.push(right)
  }
  return out
}

/** Ids of the clips on c's track that form a legal crossfade with c (so overwrite logic can spare them). */
export function xfadePartners(clips: Clip[], c: Clip): Set<string> {
  const ids = new Set<string>([c.id])
  for (const x of clips) {
    if (x.track !== c.track || x.id === c.id) continue
    const ov = x.start <= c.start ? clipEnd(x) - c.start : clipEnd(c) - x.start
    if (ov > SLACK && (x.start <= c.start ? xfadeOk(x, c) : xfadeOk(c, x))) ids.add(x.id)
  }
  return ids
}

/** Place clips one after another with overwrite (later ones win), against `base`. Siblings placed together keep legal crossfades. */
export function placeAll(base: Clip[], placed: Clip[]): Clip[] {
  let out = base
  const done: Clip[] = []
  for (const c of [...placed].sort(byStart)) {
    const skip = new Set(done.filter(s => s.track === c.track && s.start <= c.start && clipEnd(s) - c.start > SLACK && xfadeOk(s, c)).map(s => s.id))
    out = [...clearRange(out, c.track, c.start, clipEnd(c), skip), c]
    done.push(c)
  }
  return settle(out)
}

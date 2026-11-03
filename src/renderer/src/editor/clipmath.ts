import { clipDur, clipEnd, MIN_CLIP, type Clip, type Project } from './model'

// Shared maths for the pure edit ops (agent A). Tunables live here, not inline.
export const EPS = 1e-9          // timeline times closer than this are "the same instant"
export const LEN_EPS = 1e-9      // slack when comparing a length against MIN_CLIP
export const HISTORY_CAP = 200

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

/** Clamp fades so fadeIn + fadeOut <= duration (fadeIn wins, fadeOut gets what is left). */
export function fitFades(c: Clip): Clip {
  const d = clipDur(c)
  const fadeIn = clamp(c.fadeIn, 0, d), fadeOut = clamp(c.fadeOut, 0, d - fadeIn)
  return fadeIn === c.fadeIn && fadeOut === c.fadeOut ? c : { ...c, fadeIn, fadeOut }
}

/** The part of clip c that sits on timeline [from, to] (from/to inside the clip). Fades only survive on uncut ends. */
export function piece(c: Clip, from: number, to: number, id: string): Clip | null {
  const cs = c.start, ce = clipEnd(c)
  const cutHead = from > cs + EPS, cutTail = to < ce - EPS
  const srcIn = cutHead ? c.srcIn + (from - cs) : c.srcIn
  const srcOut = cutTail ? c.srcIn + (to - cs) : c.srcOut
  if (tooShort(srcOut - srcIn)) return null
  return fitFades({ ...c, id, start: cutHead ? from : cs, srcIn, srcOut, fadeIn: cutHead ? 0 : c.fadeIn, fadeOut: cutTail ? 0 : c.fadeOut })
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

/** Place clips one after another with overwrite (later ones win), against `base`. */
export function placeAll(base: Clip[], placed: Clip[]): Clip[] {
  let out = base
  for (const c of [...placed].sort((a, b) => a.start - b.start)) {
    out = [...clearRange(out, c.track, c.start, clipEnd(c)), c]
  }
  return out
}

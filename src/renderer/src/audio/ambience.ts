import type { AmbienceSound } from '../../../shared/types'

/** Pure helpers for the ambience layer (NG's own Sound bites looped under the music). No Web Audio in here. All knobs in AMBIENCE. */
export const AMBIENCE = {
  levelMinDb: -48, levelMaxDb: -6,        // master level slider
  soundMinDb: -24, soundMaxDb: 6,         // each sound's own level
  soundDefaultDb: 0,
  loopFadeSec: 1.5,                       // crossfade at the loop point (capped to a quarter of a short sound)
  maxSeconds: 300,                        // longer recordings are cut to this before looping (memory)
  fadeInSec: 0.6, fadeOutSec: 0.8, switchSec: 0.4,
  category: 'Sound bites'
} as const

const clamp = (v: number, lo: number, hi: number, fallback: number) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
export const clampMasterDb = (db: number) => clamp(db, AMBIENCE.levelMinDb, AMBIENCE.levelMaxDb, -20)
export const clampSoundDb = (db: number) => clamp(db, AMBIENCE.soundMinDb, AMBIENCE.soundMaxDb, AMBIENCE.soundDefaultDb)
export const dbToGain = (db: number) => Math.pow(10, db / 20)

/** Saved list -> a clean list: only { rel: string, level: number } entries, one per rel, levels clamped. Anything odd is dropped. */
export function cleanSounds(v: unknown): AmbienceSound[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>(), out: AmbienceSound[] = []
  for (const e of v) {
    if (!e || typeof e.rel !== 'string' || !e.rel || seen.has(e.rel)) continue
    seen.add(e.rel); out.push({ rel: e.rel, level: clampSoundDb(typeof e.level === 'number' ? e.level : AMBIENCE.soundDefaultDb), ...(typeof e.loop === 'boolean' ? { loop: e.loop } : {}), ...(Array.isArray(e.queue) && e.queue.length ? { queue: e.queue.filter((q: unknown) => typeof q === 'string' && q) } : {}) })
  }
  return out
}

/** Blend the last `raw.length - length` samples into the first ones (equal power) and cut the extra off,
 *  so the end flows straight into the start: no click at the loop point. */
export function makeLoopable(raw: Float32Array, length: number): Float32Array {
  const fade = raw.length - length, o = raw.slice(0, length)
  for (let i = 0; i < fade; i++) {
    const t = (i / fade) * Math.PI / 2
    o[i] = raw[i] * Math.sin(t) + raw[length + i] * Math.cos(t)
  }
  return o
}

/** Turn decoded channels of any recording into seamlessly loopable ones. Long files are cut to maxSeconds; the crossfade is
 *  loopFadeSec, but never more than a quarter of the sound. Returns the new channels (shorter than the input by the crossfade). */
export function loopChannels(chans: Float32Array[], rate: number): Float32Array[] {
  const total = Math.min(chans[0].length, Math.floor(AMBIENCE.maxSeconds * rate))
  const fade = Math.min(Math.floor(AMBIENCE.loopFadeSec * rate), Math.floor(total / 4))
  if (fade < 2) return chans.map((c) => c.slice(0, total))   // too short to crossfade: loop as is
  return chans.map((c) => makeLoopable(c.subarray(0, total), total - fade))
}

/** A name for a chip: the path inside 'Sound bites', without the file extension. */
export const soundName = (rel: string) => rel.replace(/^[^/]*\//, '').replace(/\.[^./]+$/, '')

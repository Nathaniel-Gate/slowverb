import { clipDur, clipEnd, type Clip, type EnvPoint, type FadeCurve, type Project } from './model'
import { ENV_GAIN_MAX, ENV_RAMP, EPS, FADE_CURVES, clamp, clipEnv, envGain, finite, lockedIds, setEnv, tidyEnv } from './clipmath'
import { targetTracks } from './opsRange'

// Volume envelope (Fairlight rubber band), range gain/mute/fade via the envelope, fade curves. All pure: a NEW Project,
// or the SAME object when nothing changes. Locked tracks are read-only. Envelope t is seconds from the clip start.

/** Envelope gain of c at clip-local t (linear between points, held past the ends, 1 with no envelope). */
export const envAt = (c: Clip, tClip: number): number => envGain(c.env, tClip)

function editClip(p: Project, id: string, f: (c: Clip) => Clip): Project {
  const c = p.clips.find(x => x.id === id)
  if (!c || lockedIds(p).has(c.track)) return p
  const n = f(c)
  return n === c ? p : { ...p, clips: p.clips.map(x => (x === c ? n : x)) }
}

/**
 * Add a point at (tClip, g), or move point `index` there. t is clamped into the clip (a moved point also between its
 * neighbours, so indexes stay stable during a drag); g is clamped to [0, ENV_GAIN_MAX]. A bad index is a no-op.
 */
export function setEnvPoint(p: Project, clipId: string, tClip: number, g: number, index?: number): Project {
  if (!finite(tClip) || !finite(g)) return p
  return editClip(p, clipId, c => {
    const env = c.env ?? [], d = clipDur(c), gg = clamp(g, 0, ENV_GAIN_MAX)
    if (index !== undefined) {
      if (!Number.isInteger(index) || index < 0 || index >= env.length) return c
      const lo = index > 0 ? env[index - 1].t : 0, hi = index < env.length - 1 ? env[index + 1].t : d
      const t = clamp(tClip, lo, hi)
      if (t === env[index].t && gg === env[index].g) return c
      return { ...c, env: env.map((x, i) => (i === index ? { t, g: gg } : x)) }
    }
    const t = clamp(tClip, 0, d), at = env.findIndex(x => x.t > t), i = at < 0 ? env.length : at
    return { ...c, env: [...env.slice(0, i), { t, g: gg }, ...env.slice(i)] }
  })
}

export function removeEnvPoint(p: Project, clipId: string, index: number): Project {
  return editClip(p, clipId, c => {
    if (!c.env || !Number.isInteger(index) || index < 0 || index >= c.env.length) return c
    return setEnv(c, c.env.filter((_, i) => i !== index))
  })
}

export function clearEnv(p: Project, clipId: string): Project {
  return editClip(p, clipId, c => setEnv(c, undefined))
}

/** Fade curve of the in or out fade on the clips (undefined counts as the default 'pow'). */
export function setFadeCurve(p: Project, ids: string[], which: 'in' | 'out', curve: FadeCurve): Project {
  if (!FADE_CURVES.includes(curve)) return p
  const key = which === 'in' ? 'fadeInCurve' : 'fadeOutCurve', want = new Set(ids), locked = lockedIds(p)
  let changed = false
  const clips = p.clips.map(c => {
    if (!want.has(c.id) || locked.has(c.track) || (c[key] ?? 'pow') === curve) return c
    changed = true
    return { ...c, [key]: curve }
  })
  return changed ? { ...p, clips } : p
}

/** A gain window in TIMELINE time: points, plus the value held before the first and after the last (equal to their g). */
type Win = { pts: EnvPoint[]; before: number; after: number }
const winAt = (w: Win, t: number) => (t < w.pts[0].t ? w.before : t >= w.pts[w.pts.length - 1].t ? w.after : envGain(w.pts, t))
const sameEnv = (a: EnvPoint[] | undefined, b: EnvPoint[] | undefined) =>
  (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((x, i) => x.t === b![i].t && x.g === b![i].g)

/** Multiply the window into the envelope of every clip on the tracks that overlaps (lo, hi). Points outside keep their value. */
function applyWindow(p: Project, tracks: string[] | undefined, lo: number, hi: number, w: Win): Project {
  const tr = targetTracks(p, tracks)
  let changed = false
  const clips = p.clips.map(c => {
    if (!tr.has(c.track) || c.start >= hi - EPS || clipEnd(c) <= lo + EPS) return c
    const local: Win = { pts: w.pts.map(x => ({ t: x.t - c.start, g: x.g })), before: w.before, after: w.after }
    const old = c.env ?? []
    const pts = [
      ...old.map(x => ({ t: x.t, g: x.g * winAt(local, x.t) })),
      ...local.pts.map(x => ({ t: x.t, g: envGain(old, x.t) * x.g })),
    ].map(x => ({ t: x.t, g: clamp(x.g, 0, ENV_GAIN_MAX) })).sort((a, b) => a.t - b.t)
    const env = tidyEnv(clipEnv(pts, clipDur(c)), true)
    if (sameEnv(c.env, env)) return c
    changed = true
    return setEnv(c, env)
  })
  return changed ? { ...p, clips } : p
}

const span = (a: number, b: number): [number, number] | null =>
  finite(a) && finite(b) && Math.abs(b - a) > EPS ? [Math.max(0, Math.min(a, b)), Math.max(a, b)] : null

/** Multiply [a, b) by 10^(db/20) through the envelope, with linear ramps of fadeSec just outside the range. No splitting. */
export function gainRange(p: Project, a: number, b: number, db: number, tracks?: string[], fadeSec?: number): Project {
  const r = span(a, b)
  if (!r || !finite(db) || db === 0 || r[1] - r[0] <= EPS) return p
  return scaleRange(p, r[0], r[1], 10 ** (db / 20), tracks, fadeSec)
}

/** Non-destructive silence over [a, b): an envelope dip to 0 with short ramps outside the range, merged with any existing envelope. */
export function muteRange(p: Project, a: number, b: number, tracks?: string[], fadeSec?: number): Project {
  const r = span(a, b)
  return r && r[1] - r[0] > EPS ? scaleRange(p, r[0], r[1], 0, tracks, fadeSec) : p
}

function scaleRange(p: Project, a: number, b: number, k: number, tracks: string[] | undefined, fadeSec?: number): Project {
  const ramp = finite(fadeSec) && fadeSec >= 0 ? fadeSec : ENV_RAMP
  const pts = [{ t: a - ramp, g: 1 }, { t: a, g: k }, { t: b, g: k }, { t: b + ramp, g: 1 }]
  return applyWindow(p, tracks, a - ramp, b + ramp, { pts, before: 1, after: 1 })
}

/**
 * Fade across [a, b] via the envelope. 'out': 1 at a down to 0 at b, and the clips crossing the range stay silent after b.
 * 'in': the clips crossing the range are silent before a and rise to 1 at b. Clips not touching the range are untouched.
 */
export function fadeRange(p: Project, a: number, b: number, kind: 'in' | 'out', tracks?: string[]): Project {
  const r = span(a, b)
  if (!r || r[1] - r[0] <= EPS) return p
  const [lo, hi] = r, out = kind === 'out'
  const pts = [{ t: lo, g: out ? 1 : 0 }, { t: hi, g: out ? 0 : 1 }]
  return applyWindow(p, tracks, lo, hi, { pts, before: out ? 1 : 0, after: out ? 0 : 1 })
}

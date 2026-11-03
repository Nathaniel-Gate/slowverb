import type { Clip, EnvPoint } from '../model'
import { TL } from '../../config/timeline'
import { clamp, gainToY, yToGain } from './timelineMath'

// Pure helpers for the volume rubber band (Clip.env). Preview maths only: what the drag shows is replayed on release
// through the store (setEnvPointAt) or one composed apply, so the committed envelope matches the preview.
export type EnvEdit =
  | { kind: 'env'; id: string; index: number; add: boolean; t: number; g: number }       // one point; add = a new point inserted at `index`
  | { kind: 'envseg'; id: string; i: number; dy: number; h: number }                      // points i and i+1 move together, vertically

const gap = TL.envMinGapSec
export const envOf = (c: Clip): EnvPoint[] => c.env ?? []
/** Unity anchors at both clip ends: how a first envelope point gets a local effect instead of changing the whole clip. */
export const anchorsFor = (dur: number): EnvPoint[] => [{ t: 0, g: 1 }, { t: dur, g: 1 }]

/** Time bounds a point may move within so the envelope stays sorted: its neighbours, or the clip ends. */
export function pointRange(env: EnvPoint[], index: number, dur: number, add: boolean): [number, number] {
  const prev = env[index - 1], next = add ? env[index] : env[index + 1]
  return [prev ? prev.t + gap : 0, next ? next.t - gap : dur]
}

/** Index a new point at time t takes (count of points before it); with no envelope it sits between the two anchors. */
export const insertIndex = (env: EnvPoint[], t: number) => (env.length ? env.filter(p => p.t < t).length : 1)

/** The envelope after a point edit (pure; the base envelope is untouched). */
export function applyEnvEdit(c: Clip, dur: number, d: EnvEdit): EnvPoint[] {
  const base = envOf(c)
  if (d.kind === 'envseg') {
    const k = c.gain > 0 ? c.gain : 1
    return base.map((p, n) => (n === d.i || n === d.i + 1
      ? { t: p.t, g: clamp(yToGain(gainToY(k * p.g, d.h) + d.dy, d.h) / k, 0, TL.envMaxGain) } : p))
  }
  const pts = d.add && !base.length ? anchorsFor(dur) : base.slice()
  const [lo, hi] = pointRange(pts, d.index, dur, d.add)
  const pt = { t: clamp(d.t, lo, Math.max(lo, hi)), g: clamp(d.g, 0, TL.envMaxGain) }
  if (d.add) pts.splice(d.index, 0, pt); else pts[d.index] = pt
  return pts
}

/** Draw points (clip px) for the polyline: the envelope held flat to both clip ends, at the clip's gain level. */
export function envPolyline(c: Clip, w: number, h: number, pps: number): { x: number; y: number }[] {
  const k = c.gain, env = envOf(c)
  const y = (g: number) => gainToY(k * g, h)
  if (!env.length) return [{ x: 0, y: y(1) }, { x: w, y: y(1) }]
  const out = env.map(p => ({ x: p.t * pps, y: y(p.g) }))
  if (out[0].x > 0) out.unshift({ x: 0, y: out[0].y })
  if (out[out.length - 1].x < w) out.push({ x: w, y: out[out.length - 1].y })
  return out
}

/** Total gain (clip gain x envelope) a pointer y maps to, and back; the envelope multiplier is that divided by clip gain. */
export const multiplierAt = (y: number, h: number, clipGain: number) =>
  clamp(yToGain(y, h) / (clipGain > 0 ? clipGain : 1), 0, TL.envMaxGain)

/** The project with one clip's envelope replaced (used for previews and for the composed one-step commits). */
export const withEnv = <P extends { clips: Clip[] }>(p: P, id: string, env: EnvPoint[] | undefined): P =>
  ({ ...p, clips: p.clips.map(c => (c.id === id ? { ...c, env: env && env.length ? env : undefined } : c)) })

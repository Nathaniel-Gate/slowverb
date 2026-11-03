import { clipEnd, type Project } from '../model'
import { duplicateClips, moveClips, rippleTrim, snapTime, trimClip } from '../ops'
import { TL } from '../../config/timeline'
import { slipClips } from './timelineMath'

// A drag is a small description; previewOf() replays it on the untouched project with the real ops,
// so what you see while dragging is exactly what mouse-up commits (overwrite rules included).
export type Drag =
  | { kind: 'move'; ids: string[]; dt: number; trackShift: number; dup: boolean }
  | { kind: 'trim'; id: string; edge: 'in' | 'out'; t: number; ripple: boolean }
  | { kind: 'slip'; ids: string[]; dsrc: number }

export function previewOf(base: Project, d: Drag): Project {
  if (d.kind === 'move') return d.dup ? duplicateClips(base, d.ids, d.dt) : moveClips(base, d.ids, d.dt, d.trackShift)
  if (d.kind === 'trim') return d.ripple ? rippleTrim(base, d.id, d.edge, d.t) : trimClip(base, d.id, d.edge, d.t)
  return slipClips(base, d.ids, d.dsrc)
}

export type SnapEnv = { enabled: boolean; playhead: number; pxPerSec: number }

/** Snap one time to edit points; `at` is where it snapped (null when it did not). */
export function snapOne(p: Project, t: number, env: SnapEnv, exclude?: string[]): { t: number; at: number | null } {
  const s = snapTime(p, t, { ...env, thresholdPx: TL.snapThresholdPx, exclude })
  return Math.abs(s - t) > 1e-9 ? { t: s, at: s } : { t, at: null }
}

/** Snap a group move: whichever of the group's outer edges lands closest to an edit point wins. */
export function snapMove(p: Project, ids: string[], dt: number, env: SnapEnv): { dt: number; at: number | null } {
  const set = new Set(ids)
  const cs = p.clips.filter(c => set.has(c.id))
  if (!cs.length || !env.enabled) return { dt, at: null }
  const head = Math.min(...cs.map(c => c.start)), tail = Math.max(...cs.map(clipEnd))
  const a = snapOne(p, head + dt, env, ids), b = snapOne(p, tail + dt, env, ids)
  const da = a.at === null ? Infinity : Math.abs(a.t - (head + dt))
  const db = b.at === null ? Infinity : Math.abs(b.t - (tail + dt))
  if (da === Infinity && db === Infinity) return { dt, at: null }
  return da <= db ? { dt: a.t - head, at: a.at } : { dt: b.t - tail, at: b.at }
}

/** Keep a vertical move inside the track list for every clip being moved. */
export function clampTrackShift(p: Project, ids: string[], shift: number): number {
  const set = new Set(ids)
  const idx = p.clips.filter(c => set.has(c.id)).map(c => p.tracks.findIndex(t => t.id === c.track)).filter(i => i >= 0)
  if (!idx.length) return 0
  return Math.max(-Math.min(...idx), Math.min(p.tracks.length - 1 - Math.max(...idx), shift))
}

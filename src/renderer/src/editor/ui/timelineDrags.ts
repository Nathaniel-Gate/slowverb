import { clipEnd, type Project } from '../model'
import { duplicateClips, moveClips, patchClips, rateStretch, rippleTrim, rollEdit, snapTime, trimClip } from '../ops'
import { TL } from '../../config/timeline'
import { fmtDb, formatTimecode, slipClips } from './timelineMath'

// A drag is a small description; previewOf() replays it on the untouched project with the real ops,
// so what you see while dragging is exactly what mouse-up commits (overwrite rules included).
export type Drag =
  | { kind: 'move'; ids: string[]; dt: number; trackShift: number; dup: boolean }
  | { kind: 'trim'; id: string; edge: 'in' | 'out'; t: number; ripple: boolean }
  | { kind: 'slip'; ids: string[]; dsrc: number }
  | { kind: 'fade'; id: string; edge: 'in' | 'out'; dur: number }
  | { kind: 'gain'; id: string; gain: number }
  | { kind: 'roll'; left: string; right: string; t: number }
  | { kind: 'stretch'; id: string; newEnd: number }

export function previewOf(base: Project, d: Drag): Project {
  switch (d.kind) {
    case 'move': return d.dup ? duplicateClips(base, d.ids, d.dt) : moveClips(base, d.ids, d.dt, d.trackShift)
    case 'trim': return d.ripple ? rippleTrim(base, d.id, d.edge, d.t) : trimClip(base, d.id, d.edge, d.t)
    case 'slip': return slipClips(base, d.ids, d.dsrc)
    case 'fade': return patchClips(base, [d.id], d.edge === 'in' ? { fadeIn: Math.max(0, d.dur) } : { fadeOut: Math.max(0, d.dur) })
    case 'gain': return patchClips(base, [d.id], { gain: Math.max(0, d.gain) })
    case 'roll': return rollEdit(base, d.left, d.right, d.t)
    case 'stretch': return rateStretch(base, d.id, d.newEnd)
  }
}

export type SnapEnv = { enabled: boolean; playhead: number; pxPerSec: number; beats?: boolean }

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

/** Move one marker (kept sorted). Pure; the timeline applies it once on release. */
export function moveMarker(p: Project, id: string, t: number): Project {
  const m = p.markers.find(x => x.id === id), at = Math.max(0, t)
  if (!m || m.t === at) return p
  return { ...p, markers: p.markers.map(x => (x.id === id ? { ...x, t: at } : x)).sort((a, b) => a.t - b.t) }
}

const sign = (n: number, d = 3) => `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(d)}s`
/** The value bubble shown next to the pointer while dragging. */
export function hudText(d: Drag, final: Project): string {
  switch (d.kind) {
    case 'move': return `${d.dup ? 'COPY ' : ''}${sign(d.dt)}${d.trackShift ? `  TRACK ${d.trackShift > 0 ? '+' : ''}${d.trackShift}` : ''}`
    case 'trim': return `${d.edge === 'in' ? 'IN' : 'OUT'} ${formatTimecode(d.t)}${d.ripple ? '  RIPPLE' : ''}`
    case 'slip': return `SLIP ${sign(d.dsrc)}`
    case 'fade': return `FADE ${Math.max(0, d.dur).toFixed(2)}s`
    case 'gain': return fmtDb(Math.max(0, d.gain))
    case 'roll': return `ROLL ${formatTimecode(d.t)}`
    case 'stretch': return `SPEED ${Math.round((final.clips.find(c => c.id === d.id)?.speed ?? 1) * 100)}%`
  }
}

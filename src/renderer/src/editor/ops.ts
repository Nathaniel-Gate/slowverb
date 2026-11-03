import { clipDur, clipEnd, MIN_CLIP, type Clip, type Marker, type Project, type Track } from './model'
import { EPS, clamp, finite, fitFades, lockedIds, uid } from './clipmath'

// Pure edit operations for the audio timeline (agent A). Every function returns a NEW Project (or the SAME object
// when the op changes nothing, so history can drop no-ops). Invariants are listed in CONTRACT.md and checked by validate().
export { splitAt, deleteClips, rippleDelete, moveClips, duplicateClips, pasteClips } from './opsEdit'
export { trimClip, rippleTrim } from './opsTrim'
export { validate } from './validate'
export { snapTime } from './snap'

export const DEFAULT_PROJECT_NAME = 'Edit'
const NEW_TRACK = { mute: false, solo: false, lock: false, gain: 1 } as const

/** One track "A1", one clip covering the whole song at t=0. A zero/unknown duration gives an empty track (a clip < MIN_CLIP is illegal). */
export function newProject(song: string, duration: number, name = DEFAULT_PROJECT_NAME): Project {
  const dur = finite(duration) && duration > 0 ? duration : 0
  const clips: Clip[] = dur >= MIN_CLIP
    ? [{ id: uid('c', []), src: song, track: 'A1', start: 0, srcIn: 0, srcOut: dur, gain: 1, fadeIn: 0, fadeOut: 0 }]
    : []
  return {
    version: 1, id: uid('p', []), name, song, sources: { [song]: { duration: dur } },
    tracks: [{ id: 'A1', name: 'A1', ...NEW_TRACK }], clips, markers: [], bpm: null, master: null,
  }
}

export function setClip(p: Project, id: string, patch: Partial<Pick<Clip, 'gain' | 'fadeIn' | 'fadeOut'>>): Project {
  const c = p.clips.find(x => x.id === id)
  if (!c || lockedIds(p).has(c.track)) return p
  const d = clipDur(c), has = (k: 'gain' | 'fadeIn' | 'fadeOut') => finite(patch[k])
  const gain = has('gain') ? Math.max(0, patch.gain!) : c.gain
  // a patched fade is clamped against the OTHER fade as it stands; if both are patched, fadeIn wins
  const fadeIn = has('fadeIn') ? clamp(patch.fadeIn!, 0, has('fadeOut') ? d : d - c.fadeOut) : c.fadeIn
  const fadeOut = has('fadeOut') ? clamp(patch.fadeOut!, 0, d - fadeIn) : c.fadeOut
  if (gain === c.gain && fadeIn === c.fadeIn && fadeOut === c.fadeOut) return p
  return { ...p, clips: p.clips.map(x => (x.id === id ? fitFades({ ...x, gain, fadeIn, fadeOut }) : x)) }
}

/** New track "A<n>" (smallest unused n); name defaults to its id. */
export function addTrack(p: Project, name?: string): Project {
  const ids = new Set(p.tracks.map(t => t.id))
  let n = p.tracks.length + 1
  while (ids.has(`A${n}`)) n++
  return { ...p, tracks: [...p.tracks, { id: `A${n}`, name: name ?? `A${n}`, ...NEW_TRACK }] }
}

/** Removes a track and its clips. Refused (no-op) for the last track or a locked one. */
export function removeTrack(p: Project, id: string): Project {
  const t = p.tracks.find(x => x.id === id)
  if (!t || t.lock || p.tracks.length <= 1) return p
  return { ...p, tracks: p.tracks.filter(x => x.id !== id), clips: p.clips.filter(c => c.track !== id) }
}

export function setTrack(p: Project, id: string, patch: Partial<Omit<Track, 'id'>>): Project {
  const t = p.tracks.find(x => x.id === id)
  if (!t) return p
  const { id: _ignored, ...rest } = patch as Partial<Track>
  const next: Track = { ...t, ...rest }
  if (!finite(next.gain) || next.gain < 0) next.gain = t.gain
  if (!Object.keys(next).some(k => next[k as keyof Track] !== t[k as keyof Track])) return p
  return { ...p, tracks: p.tracks.map(x => (x.id === id ? next : x)) }
}

export function addMarker(p: Project, t: number, name?: string): Project {
  if (!finite(t)) return p
  const m: Marker = { id: uid('m', p.markers.map(x => x.id)), t: Math.max(0, t), name: name ?? `M${p.markers.length + 1}` }
  return { ...p, markers: [...p.markers, m].sort((a, b) => a.t - b.t) }
}

export function removeMarker(p: Project, id: string): Project {
  return p.markers.some(m => m.id === id) ? { ...p, markers: p.markers.filter(m => m.id !== id) } : p
}

/** Sorted unique clip starts and ends (times within EPS count as one). */
export function editPoints(p: Project): number[] {
  const all = p.clips.flatMap(c => [c.start, clipEnd(c)]).sort((a, b) => a - b)
  return all.filter((t, i) => i === 0 || t - all[i - 1] > EPS)
}

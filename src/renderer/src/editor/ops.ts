import { clipEnd, MIN_CLIP, type Clip, type Marker, type Project, type Track } from './model'
import { EPS, finite, uid } from './clipmath'
import { syncLoops } from './loopSync'
import * as E from './opsEdit'
import * as T from './opsTrim'
import * as R from './opsRange'
import * as S from './opsSpeed'
import * as F from './opsFade'
import * as O2 from './ops2'
import * as EV from './opsEnv'
import * as RE from './opsRangeEdit'

// Pure edit operations for the audio timeline (agent A). Every function returns a NEW Project (or the SAME object
// when the op changes nothing, so history can drop no-ops). Invariants are listed in CONTRACT.md and checked by validate().
// Wave 4: every op that edits clips is wrapped by `L` so live loops stay consistent (loopSync.ts): touched repeats are
// detached, a loop moved whole stays live. Import ops from HERE, not from the sub-modules, or loops can go stale.
const L = <A extends unknown[]>(f: (p: Project, ...a: A) => Project) => (p: Project, ...a: A): Project => syncLoops(p, f(p, ...a))

export const splitAt = L(E.splitAt), deleteClips = L(E.deleteClips), rippleDelete = L(E.rippleDelete), moveClips = L(E.moveClips)
export const duplicateClips = L(E.duplicateClips), pasteClips = L(E.pasteClips)
export const trimClip = L(T.trimClip), rippleTrim = L(T.rippleTrim)
export { validate } from './validate'
export { snapTime, snapTargets, type SnapOpts } from './snap'
// wave 2 (agent E): ranges, gaps, sync lock, speed, crossfades, queries
export { gapsOf, rippleTracks, targetTracks, type Gap, type RippleOpts } from './opsRange'
export const liftRange = L(R.liftRange), extractRange = L(R.extractRange), closeGap = L(R.closeGap), closeAllGaps = L(R.closeAllGaps), trimToPlayhead = L(R.trimToPlayhead)
export const setClipSpeed = L(S.setClipSpeed), rateStretch = L(S.rateStretch), rollEdit = L(S.rollEdit)
export const applyCrossfade = L(F.applyCrossfade), removeCrossfade = L(F.removeCrossfade), patchClips = L(F.patchClips)
export type { ClipPatch } from './opsFade'
export { clipsInRange, clipsForward, clipsBackward, nearestEditPoint, beatGrid, clipFromSource } from './ops2'
export const repeatClips = L(O2.repeatClips), insertClips = L(O2.insertClips)
export { SPEED_MIN, SPEED_MAX, REPEAT_MAX, ENV_RAMP, ENV_GAIN_MAX, FADE_CURVES } from './clipmath'
// wave 3 (agent E2): volume envelope, range mute/gain/fade, fade curves, Resolve-style smart edits
export { envAt } from './opsEnv'
export const setEnvPoint = L(EV.setEnvPoint), removeEnvPoint = L(EV.removeEnvPoint), clearEnv = L(EV.clearEnv), setFadeCurve = L(EV.setFadeCurve)
export const muteRange = L(EV.muteRange), gainRange = L(EV.gainRange), fadeRange = L(EV.fadeRange)
export const extendEdit = L(RE.extendEdit), trimToPlayheadSel = L(RE.trimToPlayheadSel), splitAtMany = L(RE.splitAtMany), cutEveryBeats = L(RE.cutEveryBeats), trimEnds = L(RE.trimEnds)
// wave 4 (agent E3): live loops
export { loopLen, loopSpan, makeLoop, updateLoop, loopFill, unloop, detachLastRepeat, loopOfClip, loopClips, nudgeLoopPoint, LOOP_MAX, LOOP_MIN_LEN, type LoopPatch } from './opsLoop'
export { syncLoops } from './loopSync'

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

/** Gain and fades of one clip (fades clamp so fadeIn + fadeOut <= duration and never below a crossfade overlap). */
export function setClip(p: Project, id: string, patch: Partial<Pick<Clip, 'gain' | 'fadeIn' | 'fadeOut'>>): Project {
  return patchClips(p, [id], patch)
}

/** New track "A<n>" (smallest unused n); name defaults to its id. A new track takes the kind of the last track, so in the
 *  Clips tab (whose slice holds only visual tracks) it is a visual track "V<n>". */
export function addTrack(p: Project, name?: string): Project {
  const ids = new Set(p.tracks.map(t => t.id)), visual = p.tracks[p.tracks.length - 1]?.kind === 'visual', pre = visual ? 'V' : 'A'
  let n = p.tracks.length + 1
  while (ids.has(`${pre}${n}`)) n++
  return { ...p, tracks: [...p.tracks, { id: `${pre}${n}`, name: name ?? `${pre}${n}`, ...NEW_TRACK, ...(visual ? { kind: 'visual' as const } : {}) }] }
}

/** Removes a track and its clips. Refused (no-op) for the last track of its kind or a locked one. */
export function removeTrack(p: Project, id: string): Project {
  const t = p.tracks.find(x => x.id === id)
  if (!t || t.lock || p.tracks.filter(x => (x.kind === 'visual') === (t.kind === 'visual')).length <= 1) return p
  return syncLoops(p, { ...p, tracks: p.tracks.filter(x => x.id !== id), clips: p.clips.filter(c => c.track !== id) })
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

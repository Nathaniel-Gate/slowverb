import type { Project, Track, TrackKind } from './model'

// ONE project per song holds both the audio edit and the Clips tab's pictures (typed tracks). Each tab works on a SLICE of it:
// the Editor tab sees only audio tracks, the Clips tab only visual tracks. Every op, the history, versions, snapping, tools and
// panels run unchanged on the slice; merge() puts the edited slice back next to the other kind, which it never touches.
// A project with no visual tracks slices to ITSELF for audio, so every edit made before the Clips tab behaves exactly as before.

export const kindOf = (t: Pick<Track, 'kind'>): TrackKind => (t.kind === 'visual' ? 'visual' : 'audio')
export const hasVisual = (p: Project) => p.tracks.some((t) => t.kind === 'visual') || Object.values(p.sources).some((s) => !!s.kind)
/** Is this source a picture or a video (not audio)? */
export const isVisualSource = (p: Project, src: string) => !!p.sources[src]?.kind

/** The track the Clips tab shows before any picture was added. Not saved until something is edited. */
export const FIRST_VISUAL: Track = { id: 'V1', name: 'V1', kind: 'visual', mute: false, solo: false, lock: false, gain: 1 }

const memo = new WeakMap<Project, Partial<Record<TrackKind, Project>>>()

/** The part of p one tab edits: that kind's tracks, their clips and loops, and every shared setting (markers, BPM, master, names). */
export function slice(p: Project, kind: TrackKind): Project {
  if (kind === 'audio' && !hasVisual(p)) return p
  const hit = memo.get(p)?.[kind]; if (hit) return hit
  const own = p.tracks.filter((t) => kindOf(t) === kind), ids = new Set(own.map((t) => t.id))
  const sources = kind === 'audio' ? Object.fromEntries(Object.entries(p.sources).filter(([, s]) => !s.kind)) : p.sources
  const out: Project = {
    ...p, sources, tracks: kind === 'visual' && !own.length ? [FIRST_VISUAL] : own, clips: p.clips.filter((c) => ids.has(c.track)),
    ...(p.loops ? { loops: p.loops.filter((l) => ids.has(l.track)) } : {})
  }
  memo.set(p, { ...memo.get(p), [kind]: out })
  return out
}

/** Put an edited slice `s` (of kind) back into `full`. Same object back when nothing changed, so history drops no-ops. */
export function merge(full: Project, s: Project, kind: TrackKind): Project {
  if (s === slice(full, kind)) return full
  if (kind === 'audio' && !hasVisual(full) && !hasVisual(s)) return s   // no pictures anywhere: exactly the old single-kind behaviour
  const other = full.tracks.filter((t) => kindOf(t) !== kind), otherIds = new Set(other.map((t) => t.id))
  const mine = s.tracks.filter((t) => !otherIds.has(t.id)).map((t) => (kind === 'visual' && t.kind !== 'visual' ? { ...t, kind: 'visual' as const } : t))
  const loops = full.loops || s.loops ? [...(full.loops ?? []).filter((l) => otherIds.has(l.track)), ...(s.loops ?? []).filter((l) => !otherIds.has(l.track))] : undefined
  const { tracks: _t, clips: _c, loops: _l, sources: _s, ...rest } = s
  return {
    ...rest,
    sources: { ...full.sources, ...s.sources },
    tracks: kind === 'visual' ? [...mine, ...other] : [...other, ...mine],   // visual tracks first: the top lane is the front layer
    clips: [...full.clips.filter((c) => otherIds.has(c.track)), ...s.clips.filter((c) => !otherIds.has(c.track))],
    ...(loops ? { loops } : {})
  }
}

/** The audio part (what the transport plays and render writes), whichever tab is open. */
export const audioOf = (p: Project) => slice(p, 'audio')
/** Visual tracks only, front layer first (tracks with no clips included). */
export const visualTracks = (p: Project) => p.tracks.filter((t) => t.kind === 'visual')

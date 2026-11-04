import type { Fx } from '../../../shared/types'

// The edit-decision model. Plain JSON, immutable updates, times in SECONDS (float).
// A gap = empty timeline. An overlap = clips on different tracks (they sum). Same-track clips never overlap.
/** Per-track effects, applied after the track's clips are mixed: a simple 3-band EQ (dB) and a reverb send (own mix/length/darkness). */
export type TrackFx = { low: number; mid: number; high: number; reverb?: { wet: number; decay: number; damping: number } }
/** Track kind: absent = an audio track (every edit made before the Clips tab existed). 'visual' = pictures and video for the Clips tab. */
export type TrackKind = 'audio' | 'visual'
export type Track = { id: string; name: string; mute: boolean; solo: boolean; lock: boolean; gain: number; target?: boolean; height?: number; collapsed?: boolean; fx?: TrackFx; kind?: 'visual' }
export type Clip = {
  id: string
  src: string       // absolute path of the source audio file (key into Project.sources and the buffer map)
  track: string     // Track.id
  start: number     // position on the timeline
  srcIn: number     // first second used from the source
  srcOut: number    // last second used (exclusive); duration on timeline = srcOut - srcIn (speed is 1)
  gain: number      // linear, 1 = unity
  fadeIn: number    // seconds
  fadeOut: number   // seconds
  speed?: number    // playback rate of this clip (default 1). Pitch follows speed. Timeline duration = (srcOut - srcIn) / speed
  name?: string; label?: string /* colour key from config/timeline.ts */; disabled?: boolean
  loop?: string                                       // id of the Loop this clip is a repeat of (see Project.loops)
  fadeInCurve?: FadeCurve; fadeOutCurve?: FadeCurve   // default 'pow' (equal power)
  env?: EnvPoint[]                                    // volume envelope (Fairlight-style rubber band). t = seconds from clip START on the timeline, g = linear gain multiplier on top of clip gain. Sorted by t, within [0, clipDur].
  // Visual clips only (Clips tab). gain = opacity (capped at 1), env = opacity line, fades = fade from/to black (or a dissolve over what is underneath).
  fit?: VisualFit                                     // how the picture fills the stage (default 'cover')
  zoom?: number                                       // slow push-in over the clip: 0 = none, 0.1 = ends 10% bigger
  audio?: boolean                                     // video clips: also play the video's own sound (default off: the song is the soundtrack)
}
export type VisualFit = 'cover' | 'contain'
export type MediaKind = 'image' | 'video'
/** What the edit knows about a source file. kind absent = audio. Stills get a long nominal duration so they can be stretched freely. */
export type SourceInfo = { duration: number; kind?: MediaKind; w?: number; h?: number }
export type Aspect = '16:9' | '9:16' | '1:1' | '4:3'
/** A loop of one source slice, repeated `count` times on ONE track, each repeat overlapping the next by `xfade` seconds (equal-power
 *  crossfade). Timeline length = count * (len - xfade) + xfade where len = srcOut - srcIn. Edit the numbers, the clips follow. */
export type Loop = { id: string; track: string; src: string; srcIn: number; srcOut: number; start: number; count: number; xfade: number; gain: number; tail?: number /* seconds added to (or taken off) the LAST repeat's end, so the end can be extended like a normal clip while every other repeat stays a live loop repeat */ }
export type FadeCurve = 'lin' | 'pow' | 'log' | 's'
export type EnvPoint = { t: number; g: number }
export type Marker = { id: string; t: number; name: string; color?: string }
export type Project = {
  version: 1
  id: string
  name: string                                   // version name, e.g. "Extended"
  song: string                                   // path of the song this edit belongs to
  sources: Record<string, SourceInfo>            // by path
  tracks: Track[]
  clips: Clip[]
  markers: Marker[]
  bpm: number | null
  bpmOffset?: number                             // seconds: time of the first beat
  loops?: Loop[]                                 // live loops: each is expanded into overlapping repeat clips (Clip.loop = Loop.id); editing the Loop regenerates them
  smoothCuts?: boolean                           // micro-fades (a few ms) on every clip boundary so cuts never click (default true)
  autoDeleteEmpty?: boolean                      // remove a track as soon as its last clip leaves it (off by default)
  syncLock?: boolean                             // ripple edits also shift non-targeted tracks (default true)
  master: Fx | null                              // speed/reverb applied to the whole mix (phase 3)
  stage?: { aspect: Aspect }                     // Clips tab preview shape (default 16:9)
}
export type Tool = 'select' | 'razor' | 'ripple' | 'slip' | 'hand' | 'zoom' | 'roll' | 'rate' | 'trackfwd' | 'range'

export const clipSpeed = (c: Clip) => c.speed && c.speed > 0 ? c.speed : 1
export const srcSpan = (c: Clip) => c.srcOut - c.srcIn                 // seconds of SOURCE used
export const clipDur = (c: Clip) => (c.srcOut - c.srcIn) / clipSpeed(c)   // seconds on the TIMELINE
export const clipEnd = (c: Clip) => c.start + clipDur(c)
export const projectEnd = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
export const MIN_CLIP = 0.01   // seconds; anything shorter is dropped

import type { Fx } from '../../../shared/types'

// The edit-decision model. Plain JSON, immutable updates, times in SECONDS (float).
// A gap = empty timeline. An overlap = clips on different tracks (they sum). Same-track clips never overlap.
export type Track = { id: string; name: string; mute: boolean; solo: boolean; lock: boolean; gain: number; target?: boolean; height?: number; collapsed?: boolean }
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
  fadeInCurve?: FadeCurve; fadeOutCurve?: FadeCurve   // default 'pow' (equal power)
  env?: EnvPoint[]                                    // volume envelope (Fairlight-style rubber band). t = seconds from clip START on the timeline, g = linear gain multiplier on top of clip gain. Sorted by t, within [0, clipDur].
}
export type FadeCurve = 'lin' | 'pow' | 'log' | 's'
export type EnvPoint = { t: number; g: number }
export type Marker = { id: string; t: number; name: string; color?: string }
export type Project = {
  version: 1
  id: string
  name: string                                   // version name, e.g. "Extended"
  song: string                                   // path of the song this edit belongs to
  sources: Record<string, { duration: number }>  // by path
  tracks: Track[]
  clips: Clip[]
  markers: Marker[]
  bpm: number | null
  bpmOffset?: number                             // seconds: time of the first beat
  smoothCuts?: boolean                           // micro-fades (a few ms) on every clip boundary so cuts never click (default true)
  syncLock?: boolean                             // ripple edits also shift non-targeted tracks (default true)
  master: Fx | null                              // speed/reverb applied to the whole mix (phase 3)
}
export type Tool = 'select' | 'razor' | 'ripple' | 'slip' | 'hand' | 'zoom' | 'roll' | 'rate' | 'trackfwd' | 'range'

export const clipSpeed = (c: Clip) => c.speed && c.speed > 0 ? c.speed : 1
export const srcSpan = (c: Clip) => c.srcOut - c.srcIn                 // seconds of SOURCE used
export const clipDur = (c: Clip) => (c.srcOut - c.srcIn) / clipSpeed(c)   // seconds on the TIMELINE
export const clipEnd = (c: Clip) => c.start + clipDur(c)
export const projectEnd = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
export const MIN_CLIP = 0.01   // seconds; anything shorter is dropped

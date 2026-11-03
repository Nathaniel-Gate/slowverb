import type { Fx } from '../../../shared/types'

// The edit-decision model. Plain JSON, immutable updates, times in SECONDS (float).
// A gap = empty timeline. An overlap = clips on different tracks (they sum). Same-track clips never overlap.
export type Track = { id: string; name: string; mute: boolean; solo: boolean; lock: boolean; gain: number }
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
}
export type Marker = { id: string; t: number; name: string }
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
  master: Fx | null                              // speed/reverb applied to the whole mix (phase 3)
}
export type Tool = 'select' | 'razor' | 'ripple' | 'slip' | 'hand' | 'zoom'

export const clipDur = (c: Clip) => c.srcOut - c.srcIn
export const clipEnd = (c: Clip) => c.start + clipDur(c)
export const projectEnd = (p: Project) => p.clips.reduce((m, c) => Math.max(m, clipEnd(c)), 0)
export const MIN_CLIP = 0.01   // seconds; anything shorter is dropped

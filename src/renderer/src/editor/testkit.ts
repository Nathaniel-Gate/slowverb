import type { Clip, Project } from './model'
import { clipEnd } from './model'
import { validate } from './validate'
import { expect } from 'vitest'

// Test helpers shared by the ops tests (not shipped logic).
export const A = '/m/a.wav', B = '/m/b.wav'   // durations 10 and 5

export const mk = (id: string, track: string, start: number, srcIn: number, srcOut: number, src = A, extra: Partial<Clip> = {}): Clip =>
  ({ id, src, track, start, srcIn, srcOut, gain: 1, fadeIn: 0, fadeOut: 0, ...extra })

export function proj(clips: Clip[], opts: { lock?: string[]; tracks?: number } = {}): Project {
  const n = opts.tracks ?? 3
  return {
    version: 1, id: 'p', name: 'T', song: A, sources: { [A]: { duration: 10 }, [B]: { duration: 5 } },
    tracks: Array.from({ length: n }, (_, i) => ({ id: `T${i + 1}`, name: `T${i + 1}`, mute: false, solo: false, lock: !!opts.lock?.includes(`T${i + 1}`), gain: 1 })),
    clips, markers: [], bpm: null, master: null,
  }
}

export const ok = (p: Project) => expect(validate(p)).toEqual([])
export const get = (p: Project, id: string) => p.clips.find(c => c.id === id)!
export const on = (p: Project, track: string) => p.clips.filter(c => c.track === track).sort((a, b) => a.start - b.start)
/** [start, end] pairs on a track, rounded for stable comparison */
export const spans = (p: Project, track: string) => on(p, track).map(c => [+c.start.toFixed(6), +clipEnd(c).toFixed(6)])

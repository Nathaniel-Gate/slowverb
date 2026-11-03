import { describe, expect, it } from 'vitest'
import type { Project } from '../model'
import { clipDur } from '../model'
import { validate } from '../ops'
import { hudText, moveMarker, previewOf, snapMove, snapOne } from './timelineDrags'

const clip = (id: string, start: number, srcIn: number, srcOut: number) => ({ id, src: '/a.m4a', track: 't1', start, srcIn, srcOut, gain: 1, fadeIn: 0, fadeOut: 0 })
const p: Project = {
  version: 1, id: 'p', name: 'x', song: '/a.m4a', sources: { '/a.m4a': { duration: 20 } },
  tracks: [{ id: 't1', name: 'A1', mute: false, solo: false, lock: false, gain: 1 }],
  clips: [clip('a', 0, 2, 6), clip('b', 4, 6, 10)], markers: [{ id: 'm1', t: 8, name: 'x' }, { id: 'm0', t: 1, name: 'y' }], bpm: null, master: null
}
const env = { enabled: true, playhead: 0, pxPerSec: 100 }

describe('timelineDrags', () => {
  it('previews a fade drag and clamps it to the clip', () => {
    const q = previewOf(p, { kind: 'fade', id: 'a', edge: 'in', dur: 1.5 })
    expect(q.clips[0].fadeIn).toBeCloseTo(1.5)
    expect(previewOf(p, { kind: 'fade', id: 'a', edge: 'out', dur: 99 }).clips[0].fadeOut).toBeLessThanOrEqual(clipDur(p.clips[0]))
  })
  it('previews a gain drag', () => {
    expect(previewOf(p, { kind: 'gain', id: 'a', gain: 0.5 }).clips[0].gain).toBe(0.5)
  })
  it('rolls a cut and keeps the project valid and the same length', () => {
    const q = previewOf(p, { kind: 'roll', left: 'a', right: 'b', t: 3.5 })
    expect(validate(q)).toEqual([])
  })
  it('stretches a clip to a new end by changing its speed', () => {
    const q = previewOf(p, { kind: 'stretch', id: 'a', newEnd: 2 })
    expect(q.clips[0].speed).toBeCloseTo(2); expect(validate(q)).toEqual([])
    expect(hudText({ kind: 'stretch', id: 'a', newEnd: 2 }, q)).toBe('SPEED 200%')
  })
  it('moves a marker and keeps markers sorted; unknown ids are a no-op', () => {
    expect(moveMarker(p, 'm1', 0.5).markers.map(m => m.id)).toEqual(['m1', 'm0'])
    expect(moveMarker(p, 'nope', 3)).toBe(p)
    expect(moveMarker(p, 'm1', -4).markers[0].t).toBe(0)
  })
  it('snaps a single time and a group move to edit points', () => {
    expect(snapOne(p, 3.995, env).t).toBe(4)
    expect(snapOne(p, 3.5, env).at).toBeNull()
    expect(snapMove(p, ['a'], 0.003, env).dt).toBeCloseTo(0)
  })
  it('words the drag bubble', () => {
    expect(hudText({ kind: 'move', ids: ['a'], dt: 1.2, trackShift: 0, dup: false }, p)).toBe('+1.200s')
    expect(hudText({ kind: 'trim', id: 'a', edge: 'out', t: 83.5, ripple: true }, p)).toBe('OUT 1:23.500  RIPPLE')
  })
})

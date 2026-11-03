import { describe, expect, it } from 'vitest'
import type { Project } from '../model'
import { formatTick, pickStep, slipClips } from './timelineMath'

const p: Project = {
  version: 1, id: 'p', name: 'x', song: '/a.m4a', sources: { '/a.m4a': { duration: 10 } },
  tracks: [{ id: 't1', name: 'A1', mute: false, solo: false, lock: false, gain: 1 }],
  clips: [{ id: 'c1', src: '/a.m4a', track: 't1', start: 2, srcIn: 1, srcOut: 4, gain: 1, fadeIn: 0, fadeOut: 0 }],
  markers: [], bpm: null, master: null
}

describe('timelineMath', () => {
  it('picks coarser steps when zoomed out', () => {
    expect(pickStep(1000).step).toBeLessThan(pickStep(10).step)
    expect(pickStep(10).step * 10).toBeGreaterThanOrEqual(96)
  })
  it('formats ticks with only the decimals the step needs', () => {
    expect(formatTick(75, 5)).toBe('1:15')
    expect(formatTick(75.5, 0.5)).toBe('1:15.5')
    expect(formatTick(1.234, 0.001)).toBe('0:01.234')
  })
  it('slips within source bounds and keeps position and length', () => {
    const a = slipClips(p, ['c1'], 2).clips[0]
    expect([a.start, a.srcIn, a.srcOut]).toEqual([2, 3, 6])
    const b = slipClips(p, ['c1'], 99).clips[0]
    expect(b.srcOut).toBe(10)
    const c = slipClips(p, ['c1'], -99).clips[0]
    expect(c.srcIn).toBe(0)
  })
  it('refuses locked tracks', () => {
    const locked = { ...p, tracks: [{ ...p.tracks[0], lock: true }] }
    expect(slipClips(locked, ['c1'], 1)).toBe(locked)
  })
})

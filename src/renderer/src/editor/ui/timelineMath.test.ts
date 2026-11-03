import { describe, expect, it } from 'vitest'
import type { Project } from '../model'
import { TL } from '../../config/timeline'
import { clipBox, clipsInRect, findCut, formatTimecode, gainToY, gapAt, laneAt, layoutOf, overlaps, parseTime, pickStep, formatTick, slipClips, yToGain } from './timelineMath'

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

  const two: Project = {
    ...p, tracks: [p.tracks[0], { id: 't2', name: 'A2', mute: false, solo: false, lock: false, gain: 1, height: 120 }],
    clips: [
      { id: 'a', src: '/a.m4a', track: 't1', start: 0, srcIn: 0, srcOut: 2, gain: 1, fadeIn: 0, fadeOut: 0 },
      { id: 'b', src: '/a.m4a', track: 't1', start: 2, srcIn: 2, srcOut: 4, gain: 1, fadeIn: 0, fadeOut: 0 },
      { id: 'c', src: '/a.m4a', track: 't1', start: 5, srcIn: 0, srcOut: 1, gain: 1, fadeIn: 0, fadeOut: 0 },
      { id: 'd', src: '/a.m4a', track: 't2', start: 0, srcIn: 0, srcOut: 3, gain: 1, fadeIn: 0, fadeOut: 0 },
      { id: 'e', src: '/a.m4a', track: 't2', start: 2.5, srcIn: 3, srcOut: 5, gain: 1, fadeIn: 0.5, fadeOut: 0 }
    ]
  }
  it('lays lanes out with per-track heights, collapse and live overrides', () => {
    const l = layoutOf(two.tracks)
    expect(l.hs).toEqual([TL.laneH, 120]); expect(l.tops).toEqual([0, TL.laneH]); expect(l.total).toBe(TL.laneH + 120)
    expect(laneAt(l, -1)).toBe(-1); expect(laneAt(l, 5)).toBe(0); expect(laneAt(l, TL.laneH + 1)).toBe(1); expect(laneAt(l, 9999)).toBe(2)
    expect(layoutOf([{ ...two.tracks[0], collapsed: true }]).hs[0]).toBe(TL.collapsedH)
    expect(layoutOf(two.tracks, { t2: 9999 }).hs[1]).toBe(TL.laneMaxH)
    const b = clipBox(l, 1); expect(b.y).toBe(TL.laneH + TL.clipPadY); expect(b.h).toBe(120 - 2 * TL.clipPadY)
  })
  it('marquee rect uses real lane geometry', () => {
    const l = layoutOf(two.tracks)
    expect(clipsInRect(two, l, 0, 10, 0, 10).sort()).toEqual(['a', 'b', 'c'])
    expect(clipsInRect(two, l, 0, 10, TL.laneH + 30, TL.laneH + 40).sort()).toEqual(['d', 'e'])
  })
  it('maps gain to a y and back (unity near the top third, bottom is silence)', () => {
    for (const g of [0.25, 0.5, 1, 1.5, 3]) expect(yToGain(gainToY(g, 76), 76)).toBeCloseTo(g, 4)
    expect(gainToY(2, 76)).toBeLessThan(gainToY(1, 76)); expect(yToGain(9999, 76)).toBe(0)
  })
  it('finds a cut between touching clips only', () => {
    expect(findCut(two, 't1', 2.02, 0.05)).toEqual({ left: 'a', right: 'b', t: 2 })
    expect(findCut(two, 't1', 2.2, 0.05)).toBeNull()
    expect(findCut(two, 't1', 5, 0.05)).toBeNull()
  })
  it('finds the gap under a time, leading gap included, open tail excluded', () => {
    expect(gapAt(two, 't1', 4.5)).toEqual({ track: 't1', start: 4, end: 5 })
    expect(gapAt(two, 't1', 3)).toBeNull(); expect(gapAt(two, 't1', 9)).toBeNull()
    const lead = { ...two, clips: [{ ...two.clips[2] }] }
    expect(gapAt(lead, 't1', 1)).toEqual({ track: 't1', start: 0, end: 5 })
  })
  it('lists same-track overlaps as crossfade spans', () => {
    expect(overlaps(two)).toEqual([{ id: 'd>e', track: 't2', start: 2.5, end: 3 }])
  })
  it('formats and parses typed times', () => {
    expect(formatTimecode(83.456)).toBe('1:23.456'); expect(formatTimecode(3723.5)).toBe('1:02:03.500')
    expect(parseTime('1:23.456')).toBeCloseTo(83.456); expect(parseTime('83')).toBe(83); expect(parseTime('1:02:03')).toBe(3723)
    expect(parseTime('1:75')).toBeNull(); expect(parseTime('abc')).toBeNull(); expect(parseTime('')).toBeNull()
  })
})

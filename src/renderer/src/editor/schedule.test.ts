import { describe, expect, it } from 'vitest'
import { fadeCurve, fadeGain } from './schedule'

it('equal-power fade in starts at 0, ends at 1, hits -3dB at the middle', () => {
  expect(fadeGain('in', 0, 'equalPower')).toBeCloseTo(0, 12)
  expect(fadeGain('in', 1, 'equalPower')).toBeCloseTo(1, 12)
  expect(fadeGain('in', 0.5, 'equalPower')).toBeCloseTo(Math.SQRT1_2, 12)
})
it('fade out mirrors fade in; in^2 + out^2 = 1 (constant power crossfade)', () => {
  for (const x of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
    expect(fadeGain('out', x, 'equalPower')).toBeCloseTo(fadeGain('in', 1 - x, 'equalPower'), 12)
    expect(fadeGain('in', x, 'equalPower') ** 2 + fadeGain('out', x, 'equalPower') ** 2).toBeCloseTo(1, 12)
  }
})
it('linear curve is a straight line and clamps out-of-range input', () => {
  expect(fadeGain('in', 0.3, 'linear')).toBeCloseTo(0.3, 12); expect(fadeGain('out', 0.3, 'linear')).toBeCloseTo(0.7, 12)
  expect(fadeGain('in', -1, 'linear')).toBe(0); expect(fadeGain('in', 2, 'linear')).toBe(1)
})
it('fadeCurve samples endpoints exactly, is monotonic, and supports a partial window', () => {
  const c = fadeCurve('in', 65, 0, 1, 'equalPower')
  expect(c[0]).toBe(0); expect(c[64]).toBeCloseTo(1, 6)
  for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1])
  const part = fadeCurve('in', 11, 0.5, 1, 'equalPower')
  expect(part[0]).toBeCloseTo(Math.SQRT1_2, 6); expect(part[10]).toBeCloseTo(1, 6)
  const o = fadeCurve('out', 11, 0, 1, 'equalPower'); expect(o[0]).toBeCloseTo(1, 6); expect(o[10]).toBeCloseTo(0, 6)
})

import { fadeSegment } from './schedule'
describe('fadeSegment (which part of a fade is still ahead of the play point)', () => {
  it('forward from before the window: the whole fade, 0 -> 1, starting at the window start', () => {
    expect(fadeSegment(1, 2, 0.5, 5, false)).toEqual({ t0: 1, t1: 2, at: 1, fa: 0, fb: 1 })
  })
  it('forward starting mid-fade: a partial window starting at the play point', () => {
    const s = fadeSegment(1, 2, 1.25, 5, false)!; expect(s).toMatchObject({ t0: 1.25, t1: 2, at: 1.25, fb: 1 }); expect(s.fa).toBeCloseTo(0.25, 12)
  })
  it('forward starting after the window: nothing left', () => { expect(fadeSegment(1, 2, 2.5, 5, false)).toBeNull() })
  it('reverse from after the window: whole fade walked 1 -> 0 starting at the window END', () => {
    expect(fadeSegment(1, 2, 0, 5, true)).toEqual({ t0: 1, t1: 2, at: 2, fa: 1, fb: 0 })
  })
  it('reverse starting mid-fade (play point 1.75) and entirely before it', () => {
    const s = fadeSegment(1, 2, 0, 1.75, true)!; expect(s).toMatchObject({ t0: 1, t1: 1.75, at: 1.75, fb: 0 }); expect(s.fa).toBeCloseTo(0.75, 12)
    expect(fadeSegment(1, 2, 0, 0.5, true)).toBeNull()
  })
  it('zero length or shorter than minLen is skipped', () => {
    expect(fadeSegment(1, 1, 0, 5, false)).toBeNull(); expect(fadeSegment(1, 1.001, 0, 5, false, 0.01)).toBeNull()
  })
})

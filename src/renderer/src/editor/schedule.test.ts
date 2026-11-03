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

import { edgeFades, envGainAt, envKnots } from './schedule'
import { EDITOR_AUDIO } from '../config/editorAudio'
import { mk, proj } from './testkit'

describe('fade curves lin / pow / log / s', () => {
  const curves = ['lin', 'pow', 'log', 's'] as const
  it('every curve fades in from exactly 0 to exactly 1 and out from 1 to 0, monotonic, clamped', () => {
    for (const c of curves) {
      expect(fadeGain('in', 0, c)).toBe(0); expect(fadeGain('in', 1, c)).toBeCloseTo(1, 12)
      expect(fadeGain('out', 0, c)).toBeCloseTo(1, 12); expect(fadeGain('out', 1, c)).toBe(0)
      expect(fadeGain('in', -3, c)).toBe(0); expect(fadeGain('in', 5, c)).toBeCloseTo(1, 12)
      let prev = -1; for (let i = 0; i <= 100; i++) { const g = fadeGain('in', i / 100, c); expect(g).toBeGreaterThanOrEqual(prev); prev = g }
    }
  })
  it('midpoints: lin 0.5, pow -3dB, s 0.5, log far below linear (a straight line in dB)', () => {
    expect(fadeGain('in', 0.5, 'lin')).toBeCloseTo(0.5, 12)
    expect(fadeGain('in', 0.5, 'pow')).toBeCloseTo(Math.SQRT1_2, 12)
    expect(fadeGain('in', 0.5, 's')).toBeCloseTo(0.5, 12)
    expect(fadeGain('in', 0.5, 'log')).toBeCloseTo(10 ** (-EDITOR_AUDIO.logFadeDb / 2 / 20), 2)   // about halfway in dB (ends are pinned to 0 and 1)
    expect(fadeGain('in', 0.5, 'log')).toBeLessThan(0.05)
  })
  it('s is smooth at the ends (slope 0), pow is steep at the start', () => {
    expect(fadeGain('in', 0.01, 's')).toBeLessThan(0.001); expect(fadeGain('in', 0.01, 'pow')).toBeGreaterThan(0.015)
  })
  it('default is pow; legacy names map to the new curves', () => {
    expect(fadeGain('in', 0.3)).toBe(fadeGain('in', 0.3, 'pow')); expect(fadeGain('in', 0.3, 'equalPower')).toBe(fadeGain('in', 0.3, 'pow')); expect(fadeGain('in', 0.3, 'linear')).toBe(0.3)
  })
})

describe('volume envelope maths', () => {
  const env = [{ t: 1, g: 0 }, { t: 3, g: 1 }, { t: 3, g: 0.5 }, { t: 4, g: 2 }]
  it('1 without points; flat before the first and after the last; linear between', () => {
    expect(envGainAt(undefined, 2)).toBe(1); expect(envGainAt([], 2)).toBe(1)
    expect(envGainAt(env, 0)).toBe(0); expect(envGainAt(env, 9)).toBe(2)
    expect(envGainAt(env, 2)).toBeCloseTo(0.5, 12); expect(envGainAt(env, 3.5)).toBeCloseTo(1.25, 12); expect(envGainAt(env, 1)).toBe(0)
  })
  it('knots cover exactly lo..hi with interpolated ends and the points inside', () => {
    expect(envKnots(env, 2, 3.5)).toEqual([{ t: 2, g: 0.5 }, { t: 3, g: 1 }, { t: 3, g: 0.5 }, { t: 3.5, g: 1.25 }])
    expect(envKnots(env, 0, 0.5)).toEqual([{ t: 0, g: 0 }, { t: 0.5, g: 0 }])
  })
})

describe('edgeFades (user fades + smooth-cut micro-fades)', () => {
  const ms = EDITOR_AUDIO.smoothCutSec
  it('a cut clip gets a linear micro-fade at both edges; no fade where the file itself starts/ends', () => {
    const p = proj([mk('a', 'T1', 0, 2, 4)]), f = edgeFades(p, p.clips[0], 10)
    expect(f).toMatchObject({ inSec: ms, outSec: ms, inCurve: 'lin', outCurve: 'lin' })
    const q = proj([mk('a', 'T1', 0, 0, 10)]), g = edgeFades(q, q.clips[0], 10)
    expect(g.inSec).toBe(0); expect(g.outSec).toBe(0)
  })
  it('smoothCuts: false turns the micro-fades off', () => {
    const p = { ...proj([mk('a', 'T1', 0, 2, 4)]), smoothCuts: false }
    expect(edgeFades(p, p.clips[0], 10)).toMatchObject({ inSec: 0, outSec: 0 })
  })
  it('a split that is still unbroken audio is not micro-faded at the seam; a gap or other source is', () => {
    const p = proj([mk('a', 'T1', 0, 2, 4), mk('b', 'T1', 2, 4, 6)])
    expect(edgeFades(p, p.clips[0], 10)).toMatchObject({ inSec: ms, outSec: 0 }); expect(edgeFades(p, p.clips[1], 10)).toMatchObject({ inSec: 0, outSec: ms })
    const gap = proj([mk('a', 'T1', 0, 2, 4), mk('b', 'T1', 2.5, 4, 6)]); expect(edgeFades(gap, gap.clips[0], 10).outSec).toBe(ms)
    const jump = proj([mk('a', 'T1', 0, 2, 4), mk('b', 'T1', 2, 5, 7)]); expect(edgeFades(jump, jump.clips[0], 10).outSec).toBe(ms)
  })
  it('a user fade at least as long as the micro-fade keeps its length and curve; a shorter one is replaced by the linear micro-fade', () => {
    const p = proj([mk('a', 'T1', 0, 2, 6, undefined, { fadeIn: 0.5, fadeInCurve: 's', fadeOut: 0.001, fadeOutCurve: 'log' })]), f = edgeFades(p, p.clips[0], 10)
    expect(f).toMatchObject({ inSec: 0.5, inCurve: 's', outSec: ms, outCurve: 'lin' })
  })
  it('a clip shorter than two micro-fades is split evenly, never overlapping itself', () => {
    const p = proj([mk('a', 'T1', 0, 2, 2.004)]), f = edgeFades(p, p.clips[0], 10)
    expect(f.inSec + f.outSec).toBeLessThanOrEqual(0.004 + 1e-12)
  })
})

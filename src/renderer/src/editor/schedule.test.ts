import { expect, it } from 'vitest'
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

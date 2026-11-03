import { describe, expect, it } from 'vitest'
import { clampRate, positionAfter } from './transport'

describe('clampRate', () => {
  it('clamps to +-8 and keeps the sign', () => { expect(clampRate(20)).toBe(8); expect(clampRate(-20)).toBe(-8); expect(clampRate(2)).toBe(2); expect(clampRate(-4)).toBe(-4) })
  it('tiny rates are lifted to the minimum; 0 and NaN mean stopped', () => {
    expect(clampRate(0.01)).toBe(0.1); expect(clampRate(-0.01)).toBe(-0.1); expect(clampRate(0)).toBe(0); expect(clampRate(NaN)).toBe(0)
  })
})
describe('positionAfter', () => {
  const o = { reverse: false, end: 10, loop: null }
  it('plain play advances and stops at the end', () => { expect(positionAfter(2, 3, o)).toBe(5); expect(positionAfter(2, 99, o)).toBe(10); expect(positionAfter(2, -1, o)).toBe(2) })
  it('loop wraps inside a..b (any number of passes)', () => {
    const l = { ...o, loop: { a: 4, b: 6 } }
    expect(positionAfter(5, 0.5, l)).toBeCloseTo(5.5, 12); expect(positionAfter(5, 1, l)).toBeCloseTo(4, 12)
    expect(positionAfter(5, 1.5, l)).toBeCloseTo(4.5, 12); expect(positionAfter(5, 7, l)).toBeCloseTo(4, 12); expect(positionAfter(5, 7.25, l)).toBeCloseTo(4.25, 12)
    for (let t = 0; t < 40; t += 0.37) { const p = positionAfter(4.1, t, l); expect(p).toBeGreaterThanOrEqual(4); expect(p).toBeLessThan(6) }
  })
  it('reverse walks down and stops at 0', () => {
    const r = { ...o, reverse: true }
    expect(positionAfter(5, 2, r)).toBe(3); expect(positionAfter(5, 9, r)).toBe(0)
  })
})

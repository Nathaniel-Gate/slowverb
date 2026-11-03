import { describe, expect, it } from 'vitest'
import { snapTime } from './snap'
import { addMarker } from './ops'
import { mk, proj } from './testkit'

const p0 = addMarker(proj([mk('a', 'T1', 2, 0, 3), mk('b', 'T2', 7, 0, 1)]), 10)
const o = { enabled: true, playhead: 20, pxPerSec: 100, thresholdPx: 8 }   // reach = 0.08s

describe('snapTime', () => {
  it('snaps to clip starts and ends, playhead, markers and 0', () => {
    expect(snapTime(p0, 2.05, o)).toBe(2); expect(snapTime(p0, 4.95, o)).toBe(5)
    expect(snapTime(p0, 7.07, o)).toBe(7); expect(snapTime(p0, 8.04, o)).toBe(8)
    expect(snapTime(p0, 10.03, o)).toBe(10); expect(snapTime(p0, 19.95, o)).toBe(20); expect(snapTime(p0, 0.06, o)).toBe(0)
  })
  it('leaves t alone outside the threshold or when disabled', () => {
    expect(snapTime(p0, 2.2, o)).toBe(2.2); expect(snapTime(p0, 2.05, { ...o, enabled: false })).toBe(2.05)
  })
  it('threshold is in pixels: zooming in shrinks the reach in seconds', () => {
    expect(snapTime(p0, 2.05, { ...o, pxPerSec: 1000 })).toBe(2.05)
    expect(snapTime(p0, 2.05, { ...o, pxPerSec: 10 })).toBe(2)
  })
  it('picks the nearest of two candidates', () => {
    const p = proj([mk('a', 'T1', 1, 0, 1), mk('b', 'T1', 2.05, 0, 1)])   // edges at 2 and 2.05
    expect(snapTime(p, 2.04, o)).toBe(2.05); expect(snapTime(p, 2.01, o)).toBe(2)
  })
  it('exclude removes the dragged clip as a target', () => {
    expect(snapTime(p0, 2.05, { ...o, exclude: ['a'] })).toBe(2.05)
    expect(snapTime(p0, 2.05, { ...o, exclude: ['b'] })).toBe(2)
    expect(snapTime(p0, 5.02, { ...o, exclude: ['a'] })).toBe(5.02)
  })
  it('bad inputs return t unchanged', () => {
    expect(snapTime(p0, NaN, o)).toBeNaN(); expect(snapTime(p0, 2.05, { ...o, pxPerSec: 0 })).toBe(2.05); expect(snapTime(p0, 2.05, { ...o, thresholdPx: 0 })).toBe(2.05)
  })
  it('an empty project still snaps to 0 and the playhead', () => {
    expect(snapTime(proj([]), 0.03, o)).toBe(0); expect(snapTime(proj([]), 19.99, o)).toBe(20)
  })
})

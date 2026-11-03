import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { clipEnd } from './model'
import { mk, ok, proj, get, spans } from './testkit'

describe('extendEdit (E)', () => {
  it('rolls the nearest cut between two clips', () => {
    const p = ops.extendEdit(proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 4, 8)]), 3)
    ok(p); expect(spans(p, 'T1')).toEqual([[0, 3], [3, 8]])
  })
  it('lone out edge ripples with sync lock, trims without', () => {
    const p0 = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 6, 0, 2), mk('c', 'T2', 7, 0, 1)])
    const r = ops.extendEdit(p0, 5, ['T1'])
    ok(r); expect(spans(r, 'T1')).toEqual([[0, 5], [7, 9]]); expect(spans(r, 'T2')).toEqual([[8, 9]])
    const t = ops.extendEdit({ ...p0, syncLock: false }, 5, ['T1'])
    expect(spans(t, 'T1')).toEqual([[0, 5], [6, 8]])
  })
  it('lone in edge trims so the start lands on t; no-op when already there', () => {
    const p0 = proj([mk('a', 'T1', 2, 2, 6)])
    expect(spans(ops.extendEdit(p0, 1.5), 'T1')).toEqual([[1.5, 6]])
    expect(ops.extendEdit(p0, 2)).toBe(p0)
    expect(ops.extendEdit(proj([]), 2)).toEqual(proj([]))
  })
  it('acts on every track with an edit at that point', () => {
    const p = ops.extendEdit(proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 4, 8), mk('c', 'T2', 0, 0, 4), mk('d', 'T2', 4, 4, 8)]), 4.5)
    ok(p); expect(get(p, 'a').srcOut).toBeCloseTo(4.5); expect(get(p, 'c').srcOut).toBeCloseTo(4.5)
  })
})

describe('trimToPlayheadSel', () => {
  const p0 = () => proj([mk('a', 'T1', 0, 0, 6), mk('b', 'T1', 6, 0, 2), mk('c', 'T2', 1, 0, 6)])
  it('plain trims start and end at the playhead', () => {
    expect(spans(ops.trimToPlayheadSel(p0(), ['a'], 2, 'start', false), 'T1')).toEqual([[2, 6], [6, 8]])
    expect(spans(ops.trimToPlayheadSel(p0(), ['a'], 2, 'end', false), 'T1')).toEqual([[0, 2], [6, 8]])
  })
  it('ripple pulls later material in', () => {
    const p = ops.trimToPlayheadSel(p0(), ['a'], 2, 'end', true)
    ok(p); expect(spans(p, 'T1')).toEqual([[0, 2], [2, 4]])
    const m = ops.trimToPlayheadSel(p0(), ['a', 'c'], 2, 'start', true)
    ok(m); expect(spans(m, 'T1')).toEqual([[0, 4], [4, 6]]); expect(spans(m, 'T2')).toEqual([[1, 6]])
  })
  it('skips clips the playhead is not inside', () => {
    const p = p0()
    expect(ops.trimToPlayheadSel(p, ['b'], 2, 'end', false)).toBe(p)
  })
})

describe('multi-cuts and silence trim', () => {
  it('splitAtMany cuts at each unique time', () => {
    const p = ops.splitAtMany(proj([mk('a', 'T1', 0, 0, 10)]), [3, 1, 3, NaN, 20])
    ok(p); expect(spans(p, 'T1')).toEqual([[0, 1], [1, 3], [3, 10]])
  })
  it('cutEveryBeats follows the bpm grid and offset', () => {
    const p0 = { ...proj([mk('a', 'T1', 0, 0, 10)]), bpm: 120, bpmOffset: 0.25 }
    const p = ops.cutEveryBeats(p0, 0, 10, 4)   // bar = 2s
    ok(p); expect(spans(p, 'T1').map(s => s[0])).toEqual([0, 0.25, 2.25, 4.25, 6.25, 8.25])
    expect(ops.cutEveryBeats({ ...p0, bpm: null }, 0, 10, 4)).toEqual({ ...p0, bpm: null })
  })
  it('trimEnds keeps a source window in place, fades kept', () => {
    const p0 = proj([mk('a', 'T1', 2, 1, 9, undefined, { fadeIn: 0.5, speed: 2 })])
    const p = ops.trimEnds(p0, 'a', 3, 7)
    ok(p)
    const c = get(p, 'a')
    expect([c.srcIn, c.srcOut, c.start, clipEnd(c), c.fadeIn]).toEqual([3, 7, 3, 5, 0.5])
    expect(ops.trimEnds(p0, 'a', 0, 20)).toBe(p0)
    expect(ops.trimEnds(p0, 'a', 4, 4.001)).toBe(p0)
  })
})

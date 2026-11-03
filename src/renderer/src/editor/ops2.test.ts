import { describe, expect, it } from 'vitest'
import type { Project } from './model'
import {
  REPEAT_MAX, beatGrid, clipFromSource, clipsBackward, clipsForward, clipsInRange, insertClips, nearestEditPoint, repeatClips, snapTime,
} from './ops'
import { A, B, get, mk, ok, on, proj, spans } from './testkit'

const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 3, 0, 2), mk('c', 'T2', 1, 0, 1)])

describe('selection queries', () => {
  it('clipsInRange / forward / backward with optional tracks', () => {
    expect(clipsInRange(p, 1.5, 3.5).sort()).toEqual(['a', 'b', 'c']); expect(clipsInRange(p, 2, 3)).toEqual([])
    expect(clipsInRange(p, 3.5, 0.5, ['T2'])).toEqual(['c'])
    expect(clipsForward(p, 1.5).sort()).toEqual(['a', 'b', 'c']); expect(clipsForward(p, 2.5, ['T1', 'T2'])).toEqual(['b'])
    expect(clipsBackward(p, 1.5).sort()).toEqual(['a', 'c']); expect(clipsBackward(p, 0)).toEqual([])
  })
  it('nearestEditPoint in both directions', () => {
    expect(nearestEditPoint(p, 1.5, 1)).toBe(2); expect(nearestEditPoint(p, 1.5, -1)).toBe(1)
    expect(nearestEditPoint(p, 2, 1)).toBe(3); expect(nearestEditPoint(p, 5, 1)).toBeNull(); expect(nearestEditPoint(p, 0, -1)).toBeNull()
  })
})

describe('beat grid', () => {
  const b: Project = { ...p, bpm: 120, bpmOffset: 0.25 }
  it('beats from bpm and offset, never negative', () => {
    expect(beatGrid(b, 0, 2)).toEqual([0.25, 0.75, 1.25, 1.75]); expect(beatGrid({ ...b, bpmOffset: 0 }, 1, 2)).toEqual([1, 1.5, 2])
    expect(beatGrid({ ...b, bpmOffset: 1.1 }, 0, 0.7).map(x => +x.toFixed(9))).toEqual([0.1, 0.6]); expect(beatGrid(p, 0, 10)).toEqual([])
    expect(beatGrid(b, 5, 1)).toEqual([])
  })
  it('snapTime snaps to beats only when asked', () => {
    const o = { enabled: true, playhead: 50, pxPerSec: 100, thresholdPx: 8 }
    expect(snapTime(b, 0.78, o)).toBe(0.78); expect(snapTime(b, 0.78, { ...o, beats: true })).toBe(0.75)
  })
})

describe('clipFromSource', () => {
  it('builds a clean clip and clamps the range', () => {
    expect(clipFromSource(A, 10, 2, 5, 'T1', 3)).toMatchObject({ src: A, track: 'T1', start: 3, srcIn: 2, srcOut: 5, gain: 1, fadeIn: 0, fadeOut: 0 })
    expect(clipFromSource(A, 10, 8, -3, 'T1', -1)).toMatchObject({ start: 0, srcIn: 0, srcOut: 8 })
    expect(clipFromSource(A, 10, 12, 20, 'T1', 0)).toMatchObject({ srcOut: 10 })
    const t = clipFromSource(A, 10, 4, 4, 'T1', 0); expect(t.srcOut - t.srcIn).toBeCloseTo(0.01, 9)
  })
})

describe('repeatClips', () => {
  it('adds n copies back to back, overwriting later material', () => {
    const q = repeatClips(p, ['a'], 2)
    expect(spans(q, 'T1')).toEqual([[0, 2], [2, 4], [4, 6]]); ok(q)
    const both = repeatClips(p, ['a', 'b'], 1)
    expect(spans(both, 'T1')).toEqual([[0, 2], [3, 5], [5, 7], [8, 10]]); ok(both)
  })
  it('times < 1, NaN, unknown ids or locked tracks: no-op; capped at REPEAT_MAX', () => {
    expect(repeatClips(p, ['a'], 0)).toBe(p); expect(repeatClips(p, ['a'], NaN)).toBe(p); expect(repeatClips(p, ['zz'], 2)).toBe(p)
    const l = proj(p.clips, { lock: ['T1'] }); expect(repeatClips(l, ['a'], 2)).toBe(l)
    expect(on(repeatClips(p, ['c'], 1000), 'T2')).toHaveLength(REPEAT_MAX + 1)
  })
})

describe('insertClips (3-point insert)', () => {
  const clip = mk('n', 'T1', 0, 1, 3, B)
  it('splits at `at`, pushes later material right on every sync track, places the clip', () => {
    const q = insertClips(p, [clip], 1)
    expect(spans(q, 'T1')).toEqual([[0, 1], [1, 3], [3, 4], [5, 7]]); expect(spans(q, 'T2')).toEqual([[3, 4]])   // c starts at `at`, so it is pushed
    const placed = on(q, 'T1')[1]; expect(placed).toMatchObject({ src: B, srcIn: 1, srcOut: 3 }); expect(placed.id).not.toBe('n'); ok(q)
  })
  it('without sync lock only the destination track moves; target track respected', () => {
    const q = insertClips({ ...p, syncLock: false }, [clip], 0.5, 'T2')
    expect(spans(q, 'T2')).toEqual([[0.5, 2.5], [3, 4]]); expect(spans(q, 'T1')).toEqual([[0, 2], [3, 5]]); ok(q)
  })
  it('keeps speed and relative offsets; bad input is a no-op', () => {
    const q = insertClips(p, [mk('s', 'T1', 10, 0, 2, A, { speed: 2 }), mk('t', 'T1', 11, 0, 1)], 2)
    expect(spans(q, 'T1')).toEqual([[0, 2], [2, 3], [3, 4], [5, 7]]); ok(q)
    expect(insertClips(p, [], 1)).toBe(p); expect(insertClips(p, [clip], NaN)).toBe(p)
    expect(insertClips(p, [mk('u', 'T1', 0, 0, 1, '/nope')], 1)).toBe(p)
    const l = proj(p.clips, { lock: ['T1'] }); expect(insertClips(l, [clip], 1, 'T1')).toBe(l)
    expect(get(insertClips(p, [clip], -4), 'a').start).toBe(2)
  })
})

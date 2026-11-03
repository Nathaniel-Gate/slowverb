import { describe, expect, it } from 'vitest'
import type { Project } from './model'
import { closeAllGaps, closeGap, extractRange, gapsOf, liftRange, rippleDelete, rippleTrim, setTrack, trimToPlayhead } from './ops'
import { get, mk, ok, on, proj, spans } from './testkit'

const noSync = (p: Project): Project => ({ ...p, syncLock: false })

describe('gapsOf', () => {
  it('lists gaps between clips including a leading one, not the open end', () => {
    const p = proj([mk('a', 'T1', 1, 0, 2), mk('b', 'T1', 4, 0, 1), mk('c', 'T1', 5, 0, 1)])
    expect(gapsOf(p, 'T1')).toEqual([{ start: 0, end: 1 }, { start: 3, end: 4 }])
    expect(gapsOf(p, 'T2')).toEqual([])
  })
  it('a crossfade overlap is not a gap', () => {
    const p = proj([mk('a', 'T1', 0, 0, 3, undefined, { fadeOut: 1 }), mk('b', 'T1', 2, 0, 3, undefined, { fadeIn: 1 })])
    ok(p); expect(gapsOf(p, 'T1')).toEqual([])
  })
})

describe('liftRange / extractRange', () => {
  const p = proj([mk('a', 'T1', 0, 0, 10), mk('b', 'T2', 2, 0, 4)])
  it('lift leaves a gap on all tracks, splitting clips at a and b', () => {
    const q = liftRange(p, 3, 5)
    expect(spans(q, 'T1')).toEqual([[0, 3], [5, 10]]); expect(spans(q, 'T2')).toEqual([[2, 3], [5, 6]])
    expect(on(q, 'T1')[1]).toMatchObject({ srcIn: 5, srcOut: 10 }); ok(q)
  })
  it('lift honours explicit tracks, targeted tracks, and locks', () => {
    expect(spans(liftRange(p, 3, 5, ['T2']), 'T1')).toEqual([[0, 10]])
    const t = setTrack(p, 'T2', { target: true })
    expect(spans(liftRange(t, 3, 5), 'T1')).toEqual([[0, 10]]); expect(spans(liftRange(t, 3, 5), 'T2')).toEqual([[2, 3], [5, 6]])
    const l = proj(p.clips, { lock: ['T1'] })
    expect(spans(liftRange(l, 3, 5), 'T1')).toEqual([[0, 10]])
  })
  it('extract removes the range and pulls later material left (reversed a/b ok)', () => {
    const q = extractRange(p, 5, 3)
    expect(spans(q, 'T1')).toEqual([[0, 3], [3, 8]]); expect(spans(q, 'T2')).toEqual([[2, 3], [3, 4]]); ok(q)
  })
  it('extract on one track shifts the others too with sync lock, not without', () => {
    const r = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 4, 0, 2), mk('c', 'T2', 6, 0, 1)])
    expect(spans(extractRange(r, 2, 4, ['T1']), 'T2')).toEqual([[4, 5]])
    expect(spans(extractRange(noSync(r), 2, 4, ['T1']), 'T2')).toEqual([[6, 7]])
    expect(spans(extractRange(noSync(r), 2, 4, ['T1']), 'T1')).toEqual([[0, 2], [2, 4]])
  })
  it('a locked track never shifts', () => {
    const r = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 4, 0, 2), mk('c', 'T2', 6, 0, 1)], { lock: ['T2'] })
    expect(spans(extractRange(r, 2, 4), 'T2')).toEqual([[6, 7]]); expect(spans(extractRange(r, 2, 4), 'T1')).toEqual([[0, 2], [2, 4]])
  })
  it('empty or bad ranges are no-ops', () => {
    for (const [a, b] of [[3, 3], [NaN, 2], [-5, -1]]) { expect(liftRange(p, a, b)).toBe(p); expect(extractRange(p, a, b)).toBe(p) }
    expect(liftRange(p, 20, 30)).toBe(p)
  })
})

describe('closeGap / closeAllGaps', () => {
  const p = proj([mk('a', 'T1', 0, 0, 1), mk('b', 'T1', 3, 0, 1), mk('c', 'T1', 6, 0, 1), mk('d', 'T2', 8, 0, 1)])
  it('closes the gap containing t, shifting later clips (and clear sync tracks)', () => {
    const q = closeGap(p, 'T1', 2)
    expect(spans(q, 'T1')).toEqual([[0, 1], [1, 2], [4, 5]]); expect(spans(q, 'T2')).toEqual([[6, 7]]); ok(q)
  })
  it('without sync lock only that track moves', () => {
    expect(spans(closeGap(noSync(p), 'T1', 2), 'T2')).toEqual([[8, 9]])
  })
  it('is refused when a sync-locked track has material in the gap', () => {
    const b = proj([...p.clips, mk('e', 'T3', 1.5, 0, 1)])
    expect(closeGap(b, 'T1', 2)).toBe(b)
    expect(spans(closeGap(noSync(b), 'T1', 2), 'T1')).toEqual([[0, 1], [1, 2], [4, 5]])
  })
  it('no gap at t, a locked track, NaN: no-op', () => {
    expect(closeGap(p, 'T1', 0.5)).toBe(p); expect(closeGap(p, 'T1', 50)).toBe(p); expect(closeGap(p, 'T1', NaN)).toBe(p)
    const l = proj(p.clips, { lock: ['T1'] }); expect(closeGap(l, 'T1', 2)).toBe(l)
  })
  it('closeAllGaps compacts one track or every track', () => {
    const one = closeAllGaps(noSync(p), 'T1')
    expect(spans(one, 'T1')).toEqual([[0, 1], [1, 2], [2, 3]]); expect(spans(one, 'T2')).toEqual([[8, 9]])
    const all = closeAllGaps(p)
    expect(spans(all, 'T1')).toEqual([[0, 1], [1, 2], [2, 3]]); expect(spans(all, 'T2')).toEqual([[0, 1]]); ok(all)
  })
})

describe('trimToPlayhead (Q / W)', () => {
  const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2, 0, 4), mk('c', 'T1', 6, 0, 1)])
  it('Q ripple removes previous edit..t and pulls later left', () => {
    const q = trimToPlayhead(p, 3, 'prevTail', true)
    expect(spans(q, 'T1')).toEqual([[0, 2], [2, 5], [5, 6]]); expect(on(q, 'T1')[1]).toMatchObject({ srcIn: 1, srcOut: 4 }); ok(q)
  })
  it('W ripple removes t..next edit', () => {
    const q = trimToPlayhead(p, 3, 'nextHead', true)
    expect(spans(q, 'T1')).toEqual([[0, 2], [2, 3], [3, 4]]); ok(q)
  })
  it('Alt+Q / Alt+W trim without ripple', () => {
    expect(spans(trimToPlayhead(p, 3, 'prevTail', false), 'T1')).toEqual([[0, 2], [3, 6], [6, 7]])
    expect(spans(trimToPlayhead(p, 3, 'nextHead', false), 'T1')).toEqual([[0, 2], [2, 3], [6, 7]])
  })
  it('nothing under t, or t exactly on an edit: no-op', () => {
    expect(trimToPlayhead(p, 2, 'prevTail', true)).toBe(p); expect(trimToPlayhead(p, 20, 'nextHead', true)).toBe(p)
  })
})

describe('ripple ops with sync lock', () => {
  const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2, 0, 2), mk('x', 'T2', 1, 0, 4), mk('y', 'T2', 6, 0, 1)])
  it('rippleDelete cuts the same span out of other unlocked tracks', () => {
    const q = rippleDelete(p, ['a'])
    expect(spans(q, 'T1')).toEqual([[0, 2]]); expect(spans(q, 'T2')).toEqual([[0, 3], [4, 5]])
    expect(get(q, 'x')).toMatchObject({ start: 0, srcIn: 1 }); ok(q)
  })
  it('opts.tracks picks exactly which extra tracks shift', () => {
    const r = proj([...p.clips, mk('z', 'T3', 5, 0, 1)])
    const q = rippleDelete(r, ['a'], { tracks: ['T3'] })
    expect(spans(q, 'T2')).toEqual([[1, 5], [6, 7]]); expect(spans(q, 'T3')).toEqual([[3, 4]])
  })
  it('rippleTrim grow inserts space on sync tracks (splitting a crossing clip)', () => {
    const r = proj([mk('a', 'T1', 0, 0, 2), mk('x', 'T2', 1, 0, 4)])
    const q = rippleTrim(r, 'a', 'out', 3)
    expect(spans(q, 'T2')).toEqual([[1, 2], [3, 6]]); ok(q)
  })
  it('a deleted crossfade partner: the surviving clip keeps its overlap area and moves to fill', () => {
    const r = noSync(proj([mk('a', 'T1', 0, 0, 3, undefined, { fadeOut: 1 }), mk('b', 'T1', 2, 0, 3, undefined, { fadeIn: 1 })]))
    const q = rippleDelete(r, ['a'])
    expect(spans(q, 'T1')).toEqual([[0, 3]]); ok(q)
  })
})

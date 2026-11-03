import { describe, expect, it } from 'vitest'
import { clipDur, clipEnd, type Project } from './model'
import {
  SPEED_MAX, SPEED_MIN, applyCrossfade, moveClips, patchClips, rateStretch, removeCrossfade, rippleTrim, rollEdit, setClip,
  setClipSpeed, splitAt, trimClip, validate,
} from './ops'
import { get, mk, ok, on, proj, spans } from './testkit'

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)
const noSync = (p: Project): Project => ({ ...p, syncLock: false })

describe('existing ops honour clip.speed', () => {
  const half = proj([mk('s', 'T1', 1, 2, 6, undefined, { speed: 0.5 })])   // 4s of source over 8s of timeline
  it('splitAt maps timeline to source x speed', () => {
    const [l, r] = on(splitAt(half, 3), 'T1')
    expect(l).toMatchObject({ start: 1, srcIn: 2, srcOut: 3, speed: 0.5 }); expect(r).toMatchObject({ start: 3, srcIn: 3, srcOut: 6 })
    ok(splitAt(half, 3))
  })
  it('trimClip in and out edges move source by delta x speed and clamp to the source', () => {
    expect(get(trimClip(half, 's', 'out', 5), 's')).toMatchObject({ srcOut: 4 })
    expect(get(trimClip(half, 's', 'out', 100), 's')).toMatchObject({ srcOut: 10 })
    expect(get(trimClip(half, 's', 'in', 3), 's')).toMatchObject({ start: 3, srcIn: 3 })
    const g = get(trimClip(half, 's', 'in', -10), 's'); expect(g.start).toBe(0); close(g.srcIn, 1.5)
  })
  it('a fast clip respects MIN_CLIP in source span as well as timeline length', () => {
    const fast = proj([mk('f', 'T1', 0, 0, 4, undefined, { speed: 4 })])
    const q = trimClip(fast, 'f', 'out', 0); ok(q); close(get(q, 'f').srcOut, 0.04)
    expect(validate(proj([mk('f', 'T1', 0, 0, 0.02, undefined, { speed: 0.25 })]))).toEqual([])
  })
  it('rippleTrim shifts by the timeline length change', () => {
    const r = noSync(proj([mk('s', 'T1', 0, 0, 2, undefined, { speed: 2 }), mk('b', 'T1', 1, 0, 1)]))
    const q = rippleTrim(r, 's', 'out', 2)   // 1s -> 2s on the timeline (4s of source)
    expect(get(q, 's').srcOut).toBe(4); expect(spans(q, 'T1')).toEqual([[0, 2], [2, 3]]); ok(q)
  })
  it('validate rejects out-of-range speed and too-short source spans', () => {
    expect(validate(proj([mk('f', 'T1', 0, 0, 1, undefined, { speed: 9 })]))[0]).toMatch(/speed/)
    expect(validate(proj([mk('f', 'T1', 0, 0, 0.005, undefined, { speed: 0.25 })]))[0]).toMatch(/MIN_CLIP/)
  })
})

describe('setClipSpeed / rateStretch', () => {
  const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2, 0, 2), mk('x', 'T2', 3, 0, 1)])
  it('slower = longer, overwriting the neighbour without ripple', () => {
    const q = setClipSpeed(p, 'a', 0.5)
    expect(clipDur(get(q, 'a'))).toBe(4); expect(spans(q, 'T1')).toEqual([[0, 4]]); ok(q)
  })
  it('ripple pushes later material on its track and sync tracks', () => {
    const q = setClipSpeed(p, 'a', 0.5, true)
    expect(spans(q, 'T1')).toEqual([[0, 4], [4, 6]]); expect(spans(q, 'T2')).toEqual([[5, 6]]); ok(q)
    const f = setClipSpeed(p, 'a', 2, true)
    expect(spans(f, 'T1')).toEqual([[0, 1], [1, 3]]); expect(spans(f, 'T2')).toEqual([[2, 3]]); ok(f)
  })
  it('clamps to SPEED_MIN..SPEED_MAX; same speed, NaN, locked are no-ops', () => {
    expect(get(setClipSpeed(p, 'a', 100), 'a').speed).toBe(SPEED_MAX); expect(get(setClipSpeed(p, 'a', 0.01), 'a').speed).toBe(SPEED_MIN)
    expect(setClipSpeed(p, 'a', 1)).toBe(p); expect(setClipSpeed(p, 'a', NaN)).toBe(p)
    const l = proj(p.clips, { lock: ['T1'] }); expect(setClipSpeed(l, 'a', 2)).toBe(l)
  })
  it('rateStretch picks the speed that lands the end at newEnd', () => {
    const q = rateStretch(p, 'b', 6)
    expect(get(q, 'b').speed).toBe(0.5); close(clipEnd(get(q, 'b')), 6); ok(q)
    expect(rateStretch(p, 'b', 1)).toBe(p)
  })
})

describe('rollEdit', () => {
  const p = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 3, 7)])
  it('moves the cut, keeping total length', () => {
    const q = rollEdit(p, 'a', 'b', 5)
    expect(get(q, 'a')).toMatchObject({ srcOut: 5 }); expect(get(q, 'b')).toMatchObject({ start: 5, srcIn: 4 })
    expect(spans(q, 'T1')).toEqual([[0, 5], [5, 8]]); ok(q)
  })
  it('clamps to the right clip head handle and the left clip source end', () => {
    expect(get(rollEdit(p, 'a', 'b', 0), 'b').start).toBe(1)           // b.srcIn 3 allows 3s left
    const r = proj([mk('a', 'T1', 0, 6, 9), mk('b', 'T1', 3, 0, 5)])
    expect(clipEnd(get(rollEdit(r, 'a', 'b', 7), 'a'))).toBe(4)        // a has 1s of source left
  })
  it('works at speed and across a crossfade centre', () => {
    const s = proj([mk('a', 'T1', 0, 0, 4, undefined, { speed: 2 }), mk('b', 'T1', 2, 4, 8)])
    const q = rollEdit(s, 'a', 'b', 3); expect(get(q, 'a').srcOut).toBe(6); expect(get(q, 'b')).toMatchObject({ start: 3, srcIn: 5 }); ok(q)
    const x = applyCrossfade(p, 'a', 'b', 1), y = rollEdit(x, 'a', 'b', 6)
    close(get(y, 'b').start, 5.5); close(clipEnd(get(y, 'a')), 6.5); ok(y)
  })
  it('not adjacent, other track, locked: no-op', () => {
    const g = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 3, 0, 2), mk('c', 'T2', 2, 0, 2)])
    expect(rollEdit(g, 'a', 'b', 2.5)).toBe(g); expect(rollEdit(g, 'a', 'c', 2.5)).toBe(g)
    const l = proj(p.clips, { lock: ['T1'] }); expect(rollEdit(l, 'a', 'b', 5)).toBe(l)
  })
})

describe('crossfades', () => {
  const p = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 3, 7)])
  it('overlaps by dur centred on the cut using source handles', () => {
    const q = applyCrossfade(p, 'a', 'b', 1)
    expect(get(q, 'a')).toMatchObject({ srcOut: 4.5, fadeOut: 1 }); expect(get(q, 'b')).toMatchObject({ start: 3.5, srcIn: 2.5, fadeIn: 1 })
    ok(q)
  })
  it('clamps to the smaller handle; impossible returns the same p', () => {
    const h = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 0.2, 4)])
    const q = applyCrossfade(h, 'a', 'b', 2); close(get(q, 'b').fadeIn, 0.4); ok(q)
    const none = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 0, 4)])
    expect(applyCrossfade(none, 'a', 'b', 1)).toBe(none)
    expect(applyCrossfade(p, 'a', 'b', 0)).toBe(p)
    const gap = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 5, 3, 7)]); expect(applyCrossfade(gap, 'a', 'b', 1)).toBe(gap)
  })
  it('re-applying replaces it; removeCrossfade restores the cut', () => {
    const q = applyCrossfade(applyCrossfade(p, 'a', 'b', 1), 'a', 'b', 2)
    expect(get(q, 'b').fadeIn).toBe(2); ok(q)
    const r = removeCrossfade(q, 'a', 'b')
    close(clipEnd(get(r, 'a')), 4); close(get(r, 'b').start, 4); close(get(r, 'b').srcIn, 3)
    expect(get(r, 'a').fadeOut).toBe(0); ok(r); expect(removeCrossfade(p, 'a', 'b')).toBe(p)
  })
  it('works with speed', () => {
    const s = proj([mk('a', 'T1', 0, 0, 4, undefined, { speed: 2 }), mk('b', 'T1', 2, 3, 5, undefined, { speed: 0.5 })])
    const q = applyCrossfade(s, 'a', 'b', 1); ok(q)
    expect(get(q, 'a').srcOut).toBe(5); expect(get(q, 'b')).toMatchObject({ start: 1.5, srcIn: 2.75 })
  })
  it('validate rejects an overlap longer than the fades', () => {
    const bad = proj([mk('a', 'T1', 0, 0, 3, undefined, { fadeOut: 0.5 }), mk('b', 'T1', 2, 0, 3, undefined, { fadeIn: 1 })])
    expect(validate(bad)[0]).toMatch(/overlap/)
  })
  it('split inside a crossfade, moves and trims stay valid', () => {
    const q = applyCrossfade(p, 'a', 'b', 2)
    ok(splitAt(q, 4)); ok(splitAt(q, 3.5, ['a'])); ok(moveClips(q, ['a'], 0.3)); ok(moveClips(q, ['a', 'b'], 1)); ok(trimClip(q, 'a', 'out', 4.5))
    expect(spans(moveClips(q, ['a', 'b'], 1), 'T1')).toEqual([[1, 6], [4, 9]])   // moving both keeps the crossfade
  })
})

describe('patchClips / setClip', () => {
  const p = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 5, 0, 2)])
  it('patches several clips; fades clamp; name/label/disabled', () => {
    const q = patchClips(p, ['a', 'b'], { gain: 0.5, fadeIn: 3, name: 'Hook', label: 'red', disabled: true })
    expect(get(q, 'a')).toMatchObject({ gain: 0.5, fadeIn: 3, name: 'Hook', label: 'red', disabled: true }); expect(get(q, 'b').fadeIn).toBe(2); ok(q)
    expect(patchClips(p, ['a'], { gain: 1 })).toBe(p); expect(patchClips(p, ['zz'], { gain: 2 })).toBe(p)
  })
  it('fades never shrink below an existing crossfade overlap', () => {
    const x = applyCrossfade(proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 3, 7)]), 'a', 'b', 1)
    const q = setClip(x, 'a', { fadeOut: 0 }); expect(get(q, 'a').fadeOut).toBe(1); ok(patchClips(x, ['a', 'b'], { fadeIn: 0, fadeOut: 0 }))
  })
})

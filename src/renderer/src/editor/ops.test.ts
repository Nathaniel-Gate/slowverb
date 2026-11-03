import { describe, expect, it } from 'vitest'
import { MIN_CLIP, clipDur, clipEnd } from './model'
import {
  addMarker, addTrack, deleteClips, duplicateClips, editPoints, moveClips, newProject, pasteClips, removeMarker, removeTrack,
  rippleDelete, rippleTrim, setClip, setTrack, splitAt, trimClip, validate,
} from './ops'
import { A, B, get, mk, ok, on, proj, spans } from './testkit'

describe('newProject', () => {
  it('has one track A1 and one whole-song clip', () => {
    const p = newProject('/s.mp3', 12.5, 'Extended')
    expect(p.tracks.map(t => t.id)).toEqual(['A1'])
    expect(p.clips).toHaveLength(1)
    expect(p.clips[0]).toMatchObject({ src: '/s.mp3', track: 'A1', start: 0, srcIn: 0, srcOut: 12.5, gain: 1 })
    expect(p.sources['/s.mp3']).toEqual({ duration: 12.5 })
    expect(p.name).toBe('Extended'); expect(p.master).toBeNull(); expect(p.bpm).toBeNull()
    ok(p)
  })
  it('zero, tiny, NaN or Infinity duration gives an empty valid project', () => {
    for (const d of [0, 0.001, NaN, Infinity, -4]) { const p = newProject('/s.mp3', d); expect(p.clips).toEqual([]); ok(p) }
  })
  it('unique ids across projects', () => { expect(newProject('/s', 1).id).not.toBe(newProject('/s', 1).id) })
})

describe('splitAt', () => {
  it('splits a clip, keeping source continuity and the original id on the left', () => {
    const p = proj([mk('a', 'T1', 2, 1, 5)])
    const q = splitAt(p, 3)
    const [l, r] = on(q, 'T1')
    expect(l.id).toBe('a'); expect(r.id).not.toBe('a')
    expect(l).toMatchObject({ start: 2, srcIn: 1, srcOut: 2 })
    expect(r).toMatchObject({ start: 3, srcIn: 2, srcOut: 5 })
    ok(q); expect(p.clips).toHaveLength(1)          // input untouched
  })
  it('is a no-op (same object) at edges, in gaps, and within MIN_CLIP of an edge', () => {
    const p = proj([mk('a', 'T1', 2, 0, 2)])
    for (const t of [2, 4, 1, 5, 2 + MIN_CLIP / 2, 4 - MIN_CLIP / 2, NaN]) expect(splitAt(p, t)).toBe(p)
  })
  it('splits clips on every unlocked track, skips locked ones', () => {
    const p = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T2', 0, 0, 4), mk('c', 'T3', 0, 0, 4)], { lock: ['T2'] })
    const q = splitAt(p, 1)
    expect(on(q, 'T1')).toHaveLength(2); expect(on(q, 'T2')).toHaveLength(1); expect(on(q, 'T3')).toHaveLength(2); ok(q)
  })
  it('only splits ids when given, but never on a locked track', () => {
    const p = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T2', 0, 0, 4), mk('c', 'T3', 0, 0, 4)], { lock: ['T3'] })
    const q = splitAt(p, 1, ['b', 'c'])
    expect(on(q, 'T1')).toHaveLength(1); expect(on(q, 'T2')).toHaveLength(2); expect(on(q, 'T3')).toHaveLength(1)
  })
  it('fades stay on the outer ends only', () => {
    const q = splitAt(proj([mk('a', 'T1', 0, 0, 4, A, { fadeIn: 1, fadeOut: 1.5 })]), 2)
    const [l, r] = on(q, 'T1')
    expect([l.fadeIn, l.fadeOut, r.fadeIn, r.fadeOut]).toEqual([1, 0, 0, 1.5]); ok(q)
  })
  it('a fade longer than a split half is clamped', () => {
    const q = splitAt(proj([mk('a', 'T1', 0, 0, 4, A, { fadeIn: 3.5 })]), 1)
    expect(on(q, 'T1')[0].fadeIn).toBeCloseTo(1); ok(q)
  })
  it('keeps ids unique over repeated splits', () => {
    let p = proj([mk('a', 'T1', 0, 0, 10)])
    for (let t = 1; t < 10; t++) p = splitAt(p, t)
    expect(p.clips).toHaveLength(10); ok(p)
  })
})

describe('deleteClips / rippleDelete', () => {
  const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2, 2, 5), mk('c', 'T1', 6, 0, 1), mk('d', 'T2', 1, 0, 2)])
  it('deleteClips leaves gaps', () => {
    const q = deleteClips(p, ['b'])
    expect(spans(q, 'T1')).toEqual([[0, 2], [6, 7]]); ok(q)
  })
  it('ignores unknown ids and returns the same project', () => { expect(deleteClips(p, ['zzz'])).toBe(p); expect(deleteClips(p, [])).toBe(p) })
  it('does not delete on locked tracks', () => {
    const l = proj(p.clips, { lock: ['T1'] })
    expect(deleteClips(l, ['a', 'd']).clips.map(c => c.id).sort()).toEqual(['a', 'b', 'c'])
    expect(rippleDelete(l, ['a'])).toBe(l)
  })
  it('rippleDelete without sync lock closes the gap on the same track only', () => {
    const q = rippleDelete(p, ['b'], { syncLock: false })
    expect(spans(q, 'T1')).toEqual([[0, 2], [3, 4]]); expect(spans(q, 'T2')).toEqual([[1, 3]]); ok(q)
  })
  it('rippleDelete of several clips shifts later clips by the cumulative span', () => {
    const q = rippleDelete(p, ['a', 'b'])
    expect(spans(q, 'T1')).toEqual([[1, 2]])               // c: 6 - 5 = 1
  })
  it('rippleDelete across multiple tracks shifts each track by its own span (no sync lock)', () => {
    const m = { ...proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 3, 0, 1), mk('c', 'T2', 1, 0, 3), mk('d', 'T2', 5, 0, 1), mk('e', 'T3', 4, 0, 1)]), syncLock: false }
    const q = rippleDelete(m, ['a', 'c'])
    expect(spans(q, 'T1')).toEqual([[1, 2]]); expect(spans(q, 'T2')).toEqual([[2, 3]]); expect(spans(q, 'T3')).toEqual([[4, 5]]); ok(q)
  })
  it('a gap between deleted clips is preserved, not doubled', () => {
    const q = rippleDelete(p, ['a', 'c'])    // b stays, shifts by a (2)
    expect(spans(q, 'T1')).toEqual([[0, 3]])
  })
  it('touching removed spans merge', () => {
    const t = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2, 2, 4), mk('c', 'T1', 4, 4, 5)])
    expect(spans(rippleDelete(t, ['a', 'b']), 'T1')).toEqual([[0, 1]])
  })
})

describe('moveClips', () => {
  it('moves along the timeline and keeps others intact', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 5, 0, 1)])
    const q = moveClips(p, ['a'], 2)
    expect(spans(q, 'T1')).toEqual([[2, 4], [5, 6]]); ok(q)
  })
  it('clamps the earliest start to 0 and keeps relative offsets', () => {
    const p = proj([mk('a', 'T1', 1, 0, 1), mk('b', 'T1', 4, 0, 1)])
    const q = moveClips(p, ['a', 'b'], -3)
    expect(spans(q, 'T1')).toEqual([[0, 1], [3, 4]])
  })
  it('moving by 0 or an unknown id is a no-op', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2)])
    expect(moveClips(p, ['a'], 0)).toBe(p); expect(moveClips(p, ['x'], 1)).toBe(p); expect(moveClips(p, ['a'], NaN)).toBe(p)
    expect(moveClips(p, ['a'], -5)).toBe(p)    // already at 0, clamped to no movement
  })
  it('overwrites: trims the head, tail and removes fully covered clips', () => {
    const p = proj([mk('m', 'T1', 0, 0, 2), mk('x', 'T1', 3, 0, 3), mk('y', 'T1', 6, 3, 4), mk('z', 'T1', 7, 0, 2)])
    const q = moveClips(p, ['m'], 3.5)       // lands on [3.5, 5.5] over x [3,6]: x is split
    const xs = on(q, 'T1')
    expect(spans(q, 'T1')).toEqual([[3, 3.5], [3.5, 5.5], [5.5, 6], [6, 7], [7, 9]])
    expect(xs[0]).toMatchObject({ id: 'x', srcIn: 0, srcOut: 0.5 })
    expect(xs[2]).toMatchObject({ srcIn: 2.5, srcOut: 3 }); expect(xs[2].id).not.toBe('x'); ok(q)
    const r = moveClips(p, ['m'], 2.5)       // [2.5,4.5] over x: x loses its head
    expect(spans(r, 'T1')).toEqual([[2.5, 4.5], [4.5, 6], [6, 7], [7, 9]]); expect(get(r, 'x')).toMatchObject({ start: 4.5, srcIn: 1.5, srcOut: 3 })
  })
  it('removes a clip that is completely covered', () => {
    const p = proj([mk('m', 'T1', 0, 0, 4), mk('x', 'T1', 5, 0, 1)])
    const q = moveClips(p, ['m'], 4.5)
    expect(q.clips.map(c => c.id)).toEqual(['m']); ok(q)
  })
  it('drops slivers shorter than MIN_CLIP left behind', () => {
    const p = proj([mk('m', 'T1', 0, 0, 2), mk('x', 'T1', 3, 0, 3)])
    const q = moveClips(p, ['m'], 3.005)     // x's head [3, 3.005] would be 5ms: dropped
    expect(spans(q, 'T1')).toEqual([[3.005, 5.005], [5.005, 6]]); ok(q)
  })
  it('does not overwrite its own moved siblings and works across tracks with trackShift', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T2', 1, 0, 2), mk('c', 'T2', 0, 5, 6, A)])
    const q = moveClips(p, ['a', 'b'], 0.5, 1)
    expect(get(q, 'a').track).toBe('T2'); expect(get(q, 'b').track).toBe('T3')
    expect(get(q, 'a').start).toBeCloseTo(0.5)
    ok(q)
  })
  it('clamps trackShift into range', () => {
    const p = proj([mk('a', 'T1', 0, 0, 1), mk('b', 'T2', 0, 0, 1)])
    const q = moveClips(p, ['a', 'b'], 0, 5)
    expect(get(q, 'a').track).toBe('T2'); expect(get(q, 'b').track).toBe('T3')
    const r = moveClips(p, ['a', 'b'], 0, -5)
    expect(r).toBe(p)                         // already at the top
  })
  it('refuses a locked destination track and ignores clips on locked source tracks', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T2', 5, 0, 1)], { lock: ['T2'] })
    expect(moveClips(p, ['a'], 0, 1)).toBe(p)
    const q = moveClips(p, ['a', 'b'], 1)
    expect(get(q, 'a').start).toBe(1); expect(get(q, 'b').start).toBe(5)
  })
  it('landing on a locked track via dt only is impossible; overwrite never touches other tracks', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T2', 0, 0, 5)])
    const q = moveClips(p, ['a'], 1)
    expect(spans(q, 'T2')).toEqual([[0, 5]])
  })
  it('moving between adjacent clips with float error keeps invariants', () => {
    const p = proj([mk('a', 'T1', 0, 0, 0.1), mk('b', 'T1', 0.1, 0, 0.2), mk('c', 'T1', 1, 0, 0.3)])
    ok(moveClips(p, ['c'], -0.7)); ok(moveClips(p, ['c'], -0.7000000001))
  })
})

describe('trimClip', () => {
  it('trims the out edge shorter and longer within source bounds', () => {
    const p = proj([mk('a', 'T1', 1, 2, 5)])
    expect(get(trimClip(p, 'a', 'out', 3), 'a')).toMatchObject({ start: 1, srcIn: 2, srcOut: 4 })
    expect(get(trimClip(p, 'a', 'out', 5), 'a')).toMatchObject({ srcOut: 6 })
  })
  it('clamps out edge to source end and to MIN_CLIP', () => {
    const p = proj([mk('a', 'T1', 1, 2, 5)])
    expect(get(trimClip(p, 'a', 'out', 100), 'a').srcOut).toBe(10)
    expect(clipDur(get(trimClip(p, 'a', 'out', 0), 'a'))).toBeCloseTo(MIN_CLIP)
  })
  it('trims the in edge: start and srcIn move together; clamps to srcIn 0, timeline 0 and MIN_CLIP', () => {
    const p = proj([mk('a', 'T1', 3, 2, 5)])
    expect(get(trimClip(p, 'a', 'in', 4), 'a')).toMatchObject({ start: 4, srcIn: 3, srcOut: 5 })
    expect(get(trimClip(p, 'a', 'in', 0), 'a')).toMatchObject({ start: 1, srcIn: 0 })      // srcIn bound hits first
    const q = proj([mk('a', 'T1', 1, 2, 5)])
    expect(get(trimClip(q, 'a', 'in', -5), 'a')).toMatchObject({ start: 0, srcIn: 1 })     // timeline 0 bound
    const r = get(trimClip(p, 'a', 'in', 99), 'a')
    expect(clipDur(r)).toBeCloseTo(MIN_CLIP); expect(clipEnd(r)).toBeCloseTo(6)
  })
  it('no change returns the same project; locked / unknown / NaN refuse', () => {
    const p = proj([mk('a', 'T1', 1, 2, 5)])
    expect(trimClip(p, 'a', 'out', 4)).toBe(p); expect(trimClip(p, 'q', 'out', 4)).toBe(p); expect(trimClip(p, 'a', 'in', NaN)).toBe(p)
    const l = proj([mk('a', 'T1', 1, 2, 5)], { lock: ['T1'] })
    expect(trimClip(l, 'a', 'out', 2)).toBe(l)
  })
  it('overwrites neighbours it grows into (trim and remove)', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2.5, 0, 2), mk('c', 'T1', 4.5, 0, 1), mk('d', 'T2', 2, 0, 3)])
    const q = trimClip(p, 'a', 'out', 5)       // covers b fully, c partly? a->[0,5]
    expect(spans(q, 'T1')).toEqual([[0, 5], [5, 5.5]])
    expect(get(q, 'c')).toMatchObject({ start: 5, srcIn: 0.5, srcOut: 1 })
    expect(spans(q, 'T2')).toEqual([[2, 5]]); ok(q)
  })
  it('in edge growing left overwrites the previous clip', () => {
    const p = proj([mk('a', 'T1', 0, 0, 3), mk('b', 'T1', 4, 2, 5)])
    const q = trimClip(p, 'b', 'in', 2)
    expect(spans(q, 'T1')).toEqual([[0, 2], [2, 7]]); expect(get(q, 'b')).toMatchObject({ srcIn: 0, srcOut: 5 }); ok(q)
  })
  it('a growing clip stops at the source and so never overwrites beyond what the source gives', () => {
    const p = proj([mk('a', 'T1', 0, 0, 9), mk('b', 'T1', 10, 0, 1)])
    const q = trimClip(p, 'a', 'out', 50)
    expect(spans(q, 'T1')).toEqual([[0, 10], [10, 11]]); ok(q)
  })
  it('fades are clamped when the clip shrinks', () => {
    const p = proj([mk('a', 'T1', 0, 0, 4, A, { fadeIn: 1.5, fadeOut: 2 })])
    const q = trimClip(p, 'a', 'out', 2)
    expect(get(q, 'a').fadeIn + get(q, 'a').fadeOut).toBeLessThanOrEqual(2); ok(q)
  })
  it('a clip whose source is unknown is left alone', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2, '/nope.wav')])
    expect(trimClip(p, 'a', 'out', 1)).toBe(p)
  })
})

describe('rippleTrim', () => {
  const p = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 4, 0, 2), mk('c', 'T1', 8, 0, 1), mk('d', 'T2', 5, 0, 1)])
  it('out edge shorter pulls later clips of the same track left (no sync lock)', () => {
    const q = rippleTrim(p, 'a', 'out', 3, { syncLock: false })
    expect(spans(q, 'T1')).toEqual([[0, 3], [3, 5], [7, 8]]); expect(spans(q, 'T2')).toEqual([[5, 6]]); ok(q)
  })
  it('out edge longer pushes later clips right, nothing overwritten', () => {
    const q = rippleTrim(p, 'a', 'out', 6)
    expect(spans(q, 'T1')).toEqual([[0, 6], [6, 8], [10, 11]]); ok(q)
  })
  it('out growth is limited by source, shift matches the actual length change', () => {
    const q = rippleTrim(p, 'c', 'out', 500)
    expect(get(q, 'c').srcOut).toBe(10); ok(q)
    const r = rippleTrim(proj([mk('a', 'T1', 0, 0, 9), mk('b', 'T1', 9, 0, 1)]), 'a', 'out', 50)
    expect(spans(r, 'T1')).toEqual([[0, 10], [10, 11]])
  })
  it('in edge keeps the clip start and shifts later clips by the opposite amount', () => {
    const q = rippleTrim(p, 'b', 'in', 5)      // cut 1s off the head of b
    expect(get(q, 'b')).toMatchObject({ start: 4, srcIn: 1, srcOut: 2 })
    expect(spans(q, 'T1')).toEqual([[0, 4], [4, 5], [7, 8]]); ok(q)
  })
  it('in edge extending into hidden source pushes later clips right', () => {
    const q = rippleTrim(proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2, 3, 4), mk('c', 'T1', 3, 0, 1)]), 'b', 'in', 0)
    expect(get(q, 'b')).toMatchObject({ srcIn: 1 }); ok(q)
    expect(spans(q, 'T1')).toEqual([[0, 2], [2, 5], [5, 6]])
  })
  it('refuses on locked tracks, no change returns same project', () => {
    expect(rippleTrim(proj(p.clips, { lock: ['T1'] }), 'a', 'out', 1).clips).toEqual(p.clips)
    expect(rippleTrim(p, 'a', 'out', 4)).toBe(p)
  })
  it('ripple shrink to MIN_CLIP', () => {
    const q = rippleTrim(p, 'a', 'out', -5)
    expect(clipDur(get(q, 'a'))).toBeCloseTo(MIN_CLIP); ok(q)
  })
})

describe('duplicateClips', () => {
  it('copies with new ids, offset, and original kept', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2, A, { gain: 0.5 })])
    const q = duplicateClips(p, ['a'], 5)
    expect(q.clips).toHaveLength(2)
    const copy = q.clips.find(c => c.id !== 'a')!
    expect(copy).toMatchObject({ start: 5, srcIn: 0, srcOut: 2, gain: 0.5, track: 'T1' }); ok(q)
  })
  it('overwrite rule applies, including over the original', () => {
    const p = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T1', 6, 0, 1)])
    const q = duplicateClips(p, ['a'], 3)      // copy [3,7] over a's tail and b
    expect(spans(q, 'T1')).toEqual([[0, 3], [3, 7]]); ok(q)
  })
  it('dt 0, unknown ids and locked tracks are no-ops; negative dt clamps at 0', () => {
    const p = proj([mk('a', 'T1', 1, 0, 2)])
    expect(duplicateClips(p, ['a'], 0)).toBe(p); expect(duplicateClips(p, ['x'], 3)).toBe(p)
    expect(duplicateClips(proj(p.clips, { lock: ['T1'] }), ['a'], 3).clips).toHaveLength(1)
    const q = duplicateClips(p, ['a'], -10)    // copy at 0, overwrites original head
    ok(q)
  })
  it('duplicating several clips keeps relative offsets', () => {
    const p = proj([mk('a', 'T1', 0, 0, 1), mk('b', 'T2', 2, 0, 1)])
    const q = duplicateClips(p, ['a', 'b'], 10)
    expect(spans(q, 'T1')).toEqual([[0, 1], [10, 11]]); expect(spans(q, 'T2')).toEqual([[2, 3], [12, 13]]); ok(q)
  })
})

describe('pasteClips', () => {
  const clip = [mk('x', 'T2', 4, 1, 3), mk('y', 'T3', 6, 0, 1, B)]
  it('earliest lands at `at`, offsets kept, new ids, tracks preserved', () => {
    const q = pasteClips(proj([]), clip, 10)
    expect(q.clips.map(c => c.id)).not.toContain('x')
    expect(spans(q, 'T2')).toEqual([[10, 12]]); expect(spans(q, 'T3')).toEqual([[12, 13]]); ok(q)
  })
  it('target track: the earliest clip goes there, others keep their track offset (clamped)', () => {
    const q = pasteClips(proj([]), clip, 0, 'T1')
    expect(spans(q, 'T1')).toEqual([[0, 2]]); expect(spans(q, 'T2')).toEqual([[2, 3]])
    const r = pasteClips(proj([]), clip, 0, 'T3')   // second would be T4 -> clamped to T3, sequential overwrite
    ok(r)
  })
  it('overwrites what is underneath', () => {
    const p = proj([mk('k', 'T2', 9, 0, 6)])
    const q = pasteClips(p, [mk('x', 'T2', 0, 0, 2)], 10)
    expect(spans(q, 'T2')).toEqual([[9, 10], [10, 12], [12, 15]]); ok(q)
  })
  it('drops unknown sources and clamps clips past source bounds', () => {
    const q = pasteClips(proj([]), [mk('u', 'T1', 0, 0, 2, '/nope'), mk('v', 'T1', 0, 3, 9, B)], 1)
    expect(q.clips).toHaveLength(1); expect(q.clips[0]).toMatchObject({ srcIn: 3, srcOut: 5 }); ok(q)
    const none = proj([]); expect(pasteClips(none, [mk('w', 'T1', 0, 7, 9, B)], 0)).toBe(none)   // entirely past the end
  })
  it('negative `at` clamps to 0, empty clipboard / unknown track / locked track no-op', () => {
    expect(pasteClips(proj([]), [mk('x', 'T1', 3, 0, 1)], -5).clips[0].start).toBe(0)
    const p = proj([]); expect(pasteClips(p, [], 1)).toBe(p); expect(pasteClips(p, clip, 1, 'nope')).toBe(p)
    expect(pasteClips(proj([], { lock: ['T1'] }), [mk('x', 'T1', 0, 0, 1)], 0, 'T1').clips).toEqual([])
  })
  it('pasting the same clips twice gives distinct ids; overlapping clipboard onto one track stays valid', () => {
    let p = pasteClips(proj([]), [mk('x', 'T1', 0, 0, 2)], 0)
    p = pasteClips(p, [mk('x', 'T1', 0, 0, 2)], 5); ok(p); expect(new Set(p.clips.map(c => c.id)).size).toBe(2)
    ok(pasteClips(proj([]), [mk('x', 'T1', 0, 0, 3), mk('y', 'T1', 1, 0, 3)], 0))
  })
})

describe('setClip', () => {
  const p = proj([mk('a', 'T1', 0, 0, 4, A, { fadeIn: 1, fadeOut: 1 })])
  it('sets gain, clamps negative to 0', () => {
    expect(get(setClip(p, 'a', { gain: 0.3 }), 'a').gain).toBe(0.3); expect(get(setClip(p, 'a', { gain: -2 }), 'a').gain).toBe(0)
  })
  it('fades clamp so fadeIn + fadeOut <= duration', () => {
    const q = setClip(p, 'a', { fadeIn: 10 }); expect(get(q, 'a')).toMatchObject({ fadeIn: 3, fadeOut: 1 })
    const r = setClip(p, 'a', { fadeOut: 10 }); expect(get(r, 'a')).toMatchObject({ fadeIn: 1, fadeOut: 3 })
    const s = setClip(p, 'a', { fadeIn: 9, fadeOut: 9 }); expect(get(s, 'a')).toMatchObject({ fadeIn: 4, fadeOut: 0 })
    expect(get(setClip(p, 'a', { fadeIn: -1 }), 'a').fadeIn).toBe(0); ok(q); ok(r); ok(s)
  })
  it('no-ops: same values, NaN, unknown id, locked track', () => {
    expect(setClip(p, 'a', { gain: 1 })).toBe(p); expect(setClip(p, 'a', { gain: NaN })).toBe(p); expect(setClip(p, 'x', { gain: 2 })).toBe(p)
    expect(setClip(proj(p.clips, { lock: ['T1'] }), 'a', { gain: 2 }).clips[0].gain).toBe(1)
  })
})

describe('tracks and markers', () => {
  it('addTrack picks unique ids and names', () => {
    let p = proj([], { tracks: 1 }); p = addTrack(p); p = addTrack(p, 'Vox')
    expect(p.tracks.map(t => t.id)).toEqual(['T1', 'A2', 'A3']); expect(p.tracks[2].name).toBe('Vox'); ok(p)
    const q = removeTrack(p, 'A2')
    expect(addTrack(q).tracks.map(t => t.id)).toEqual(['T1', 'A3', 'A4'])
  })
  it('removeTrack drops its clips; refuses last and locked tracks', () => {
    const p = proj([mk('a', 'T1', 0, 0, 1), mk('b', 'T2', 0, 0, 1)])
    const q = removeTrack(p, 'T1'); expect(q.clips.map(c => c.id)).toEqual(['b']); ok(q)
    expect(removeTrack(proj([], { tracks: 1 }), 'T1').tracks).toHaveLength(1)
    expect(removeTrack(proj(p.clips, { lock: ['T1'] }), 'T1').tracks).toHaveLength(3)
    expect(removeTrack(p, 'nope')).toBe(p)
  })
  it('setTrack patches, ignores id and bad gain, no-op when unchanged', () => {
    const p = proj([])
    const q = setTrack(p, 'T1', { mute: true, name: 'Drums', lock: true })
    expect(q.tracks[0]).toMatchObject({ id: 'T1', mute: true, name: 'Drums', lock: true })
    expect(setTrack(p, 'T1', { mute: false })).toBe(p); expect(setTrack(p, 'T1', { gain: -1 })).toBe(p)
    expect(setTrack(p, 'T1', { id: 'evil' } as never).tracks[0].id).toBe('T1')
    expect(setTrack(q, 'T1', { lock: false }).tracks[0].lock).toBe(false)   // unlocking a locked track works
  })
  it('markers: add keeps sorted, unique ids, clamps negative; remove', () => {
    let p = proj([]); p = addMarker(p, 5, 'B'); p = addMarker(p, 2); p = addMarker(p, -3)
    expect(p.markers.map(m => m.t)).toEqual([0, 2, 5]); expect(new Set(p.markers.map(m => m.id)).size).toBe(3)
    const id = p.markers[1].id; expect(removeMarker(p, id).markers).toHaveLength(2); expect(removeMarker(p, 'x')).toBe(p)
    expect(addMarker(p, NaN)).toBe(p); ok(p)
  })
})

describe('editPoints', () => {
  it('sorted, unique starts and ends', () => {
    const p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 2, 0, 1), mk('c', 'T2', 1, 0, 2)])
    expect(editPoints(p)).toEqual([0, 1, 2, 3])
    expect(editPoints(proj([]))).toEqual([])
  })
})

describe('validate', () => {
  it('flags every kind of violation', () => {
    const bad = proj([
      mk('a', 'T1', 0, 0, 3), mk('a', 'T1', 1, 0, 3), mk('s', 'T1', 9, 0, 0.001), mk('o', 'T2', 0, 8, 12), mk('n', 'T2', 20, -1, 2),
      mk('u', 'T2', 30, 0, 1, '/nope'), mk('t', 'ghost', 40, 0, 1), mk('f', 'T3', 0, 0, 1, A, { fadeIn: 0.8, fadeOut: 0.8 }), mk('neg', 'T3', -1, 0, 1),
    ])
    const v = validate(bad).join('|')
    for (const w of ['duplicate clip', 'overlap', 'shorter than MIN_CLIP', 'past source', 'srcIn < 0', 'unknown source', 'missing track', 'fades exceed', 'start < 0']) expect(v).toContain(w)
  })
})

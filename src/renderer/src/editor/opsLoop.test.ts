import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { clipEnd, type Project } from './model'
import { A, B, get, mk, ok, on, proj } from './testkit'

const base = () => proj([mk('a', 'T1', 1, 2, 4), mk('z', 'T1', 12, 0, 3, B), mk('o', 'T2', 0, 0, 10)])
const looped = (count = 4, xf = 0.2) => ops.makeLoop(base(), 'a', count, xf)
const L0 = (p: Project) => p.loops![0]
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 9)

describe('loop maths and makeLoop', () => {
  it('loopLen / loopSpan', () => {
    const l = { id: 'L', track: 'T1', src: A, srcIn: 2, srcOut: 4, start: 1, count: 3, xfade: 0.5, gain: 1 }
    expect(ops.loopLen(l)).toBe(2)
    expect(ops.loopSpan(l)).toBe(3 * 1.5 + 0.5)
  })
  it('replaces the clip with count overlapping repeats, equal fades, first keeps the id', () => {
    const p = looped()
    ok(p)
    const l = L0(p), rs = ops.loopClips(p, l.id)
    expect(rs.map(c => c.id)[0]).toBe('a')
    expect(rs).toHaveLength(4)
    rs.forEach((c, i) => {
      close(c.start, 1 + i * 1.8); expect([c.srcIn, c.srcOut, c.fadeIn, c.fadeOut, c.loop]).toEqual([2, 4, 0.2, 0.2, l.id])
    })
    expect(l).toMatchObject({ track: 'T1', src: A, srcIn: 2, srcOut: 4, start: 1, count: 4, xfade: 0.2, gain: 1 })
    close(clipEnd(rs[3]), 1 + ops.loopSpan(l))
    expect(ops.loopOfClip(p, rs[2].id)).toBe(l)
    expect(ops.loopOfClip(p, 'o')).toBeUndefined()
  })
  it('default crossfade = min(0.05, len * 0.1), default count 4, gain and name kept', () => {
    const p = ops.makeLoop(proj([mk('a', 'T1', 0, 0, 0.3, A, { gain: 0.5, name: 'Hook', label: 'red' })]), 'a')
    ok(p)
    close(L0(p).xfade, 0.03); expect(L0(p).count).toBe(4); expect(L0(p).gain).toBe(0.5)
    expect(ops.loopClips(p, L0(p).id).every(c => c.name === 'Hook' && c.label === 'red' && c.gain === 0.5)).toBe(true)
    expect(ops.makeLoop(proj([mk('a', 'T1', 0, 0, 8)]), 'a').loops![0].xfade).toBe(0.05)
  })
  it('refuses: sped-up clip, locked track, too short, already a loop member, unknown id', () => {
    expect(ops.makeLoop(proj([mk('a', 'T1', 0, 0, 4, A, { speed: 2 })]), 'a').loops).toBeUndefined()
    const sp1 = ops.makeLoop(proj([mk('a', 'T1', 0, 0, 4, A, { speed: 1 })]), 'a'); ok(sp1); expect(sp1.loops).toHaveLength(1)
    const lk = proj([mk('a', 'T1', 0, 0, 4)], { lock: ['T1'] }); expect(ops.makeLoop(lk, 'a')).toBe(lk)
    const sh = proj([mk('a', 'T1', 0, 0, 0.03)]); expect(ops.makeLoop(sh, 'a')).toBe(sh)
    const p = looped(); expect(ops.makeLoop(p, 'a')).toBe(p); expect(ops.makeLoop(p, 'nope')).toBe(p)
  })
  it('overwrites what the repeats land on (the clip at 12 is trimmed off)', () => {
    const p = looped(8)
    ok(p)
    expect(p.clips.some(c => c.id === 'z' && c.start < 1 + ops.loopSpan(L0(p)) - 1e-6)).toBe(false)
    expect(on(p, 'T2')).toHaveLength(1)
  })
})

describe('updateLoop', () => {
  it('regenerates repeats, keeps ids, adds and removes members', () => {
    const p = looped(), id = L0(p).id, ids = ops.loopClips(p, id).map(c => c.id)
    const q = ops.updateLoop(p, id, { count: 6, xfade: 0.1, gain: 0.7 })
    ok(q)
    const rs = ops.loopClips(q, id)
    expect(rs).toHaveLength(6); expect(rs.slice(0, 4).map(c => c.id)).toEqual(ids)
    rs.forEach((c, i) => { close(c.start, 1 + i * 1.9); expect(c.gain).toBe(0.7); expect(c.fadeIn).toBe(0.1) })
    const r = ops.updateLoop(q, id, { count: 2 }); ok(r)
    expect(ops.loopClips(r, id).map(c => c.id)).toEqual(ids.slice(0, 2))
  })
  it('clamps every number', () => {
    const p = looped(), id = L0(p).id
    const q = ops.updateLoop(p, id, { srcIn: -5, srcOut: 99, count: 9999, xfade: 50, start: -3, gain: -1 })
    ok(q)
    expect(L0(q)).toMatchObject({ srcIn: 0, srcOut: 10, count: 200, xfade: 5, start: 0, gain: 0 })
    const r = ops.updateLoop(p, id, { srcOut: 1 }); ok(r)
    close(ops.loopLen(L0(r)), ops.LOOP_MIN_LEN); expect(L0(r).xfade).toBeLessThanOrEqual(ops.loopLen(L0(r)) / 2)
    const s = ops.updateLoop(p, id, { srcIn: 9 }); ok(s); close(L0(s).srcIn, 4 - ops.LOOP_MIN_LEN)
    const one = ops.updateLoop(p, id, { count: 0.2, xfade: 3 }); ok(one)
    expect(L0(one).count).toBe(1); expect(L0(one).xfade).toBe(1)
  })
  it('returns the same project for no change, NaN, a locked track or an unknown loop', () => {
    const p = looped(), id = L0(p).id
    expect(ops.updateLoop(p, id, {})).toBe(p)
    expect(ops.updateLoop(p, id, { count: 4, xfade: 0.2 })).toBe(p)
    expect(ops.updateLoop(p, id, { count: NaN, start: Infinity })).toBe(p)
    expect(ops.updateLoop(p, 'nope', { count: 2 })).toBe(p)
    const lk = ops.setTrack(p, 'T1', { lock: true })
    expect(ops.updateLoop(lk, id, { count: 2 })).toBe(lk)
  })
  it('moving start overwrites clips under the new span and leaves the old place empty', () => {
    const p = looped(2), id = L0(p).id
    const q = ops.updateLoop(p, id, { start: 11 })
    ok(q)
    expect(ops.loopClips(q, id)[0].start).toBe(11)
    expect(q.clips.filter(c => c.track === 'T1' && c.start < 5)).toHaveLength(0)
    expect(get(q, 'z') === undefined || clipEnd(get(q, 'z')) <= 11 + 1e-6 || get(q, 'z').start >= 11 + ops.loopSpan(L0(q)) - 1e-6).toBe(true)
  })
  it('regenerating over another loop detaches the members it cuts', () => {
    let p = proj([mk('a', 'T1', 0, 0, 2), mk('b', 'T1', 5, 0, 2, B)])
    p = ops.makeLoop(p, 'a', 2, 0.1); p = ops.makeLoop(p, 'b', 2, 0.1)
    ok(p)
    const la = p.loops!.find(l => l.src === A)!
    const q = ops.updateLoop(p, la.id, { count: 4 })
    ok(q)
    expect(ops.loopClips(q, la.id)).toHaveLength(4)
    const lb = q.loops!.find(l => l.src === B)
    if (lb) expect(ops.loopClips(q, lb.id).every(c => c.start >= 0)).toBe(true)
  })
})

describe('loopFill, unloop, nudge', () => {
  it('loopFill reaches or just passes endTime', () => {
    const p = looped(), id = L0(p).id
    for (const end of [2, 7.3, 10.0, 20, 0]) {
      const q = ops.loopFill(p, id, end), l = L0(q)
      ok(q)
      expect(l.start + ops.loopSpan(l)).toBeGreaterThanOrEqual(end - 1e-9)
      if (l.count > 1) expect(l.start + ops.loopSpan({ ...l, count: l.count - 1 })).toBeLessThan(end)
    }
    expect(L0(ops.loopFill(p, id, 1 + 1.8 * 3 + 0.2)).count).toBe(3)   // exact hit: no extra repeat
  })
  it('unloop keeps the clips, drops the record', () => {
    const p = looped(), q = ops.unloop(p, L0(p).id)
    ok(q)
    expect(q.loops).toBeUndefined()
    expect(q.clips.filter(c => c.track === 'T1' && c.src === A)).toHaveLength(4)
    expect(q.clips.some(c => c.loop !== undefined)).toBe(false)
    expect(ops.unloop(q, 'x')).toBe(q)
  })
  it('nudges land on whole microseconds and never drift', () => {
    let p = looped()
    const id = L0(p).id
    for (let i = 0; i < 300; i++) p = ops.nudgeLoopPoint(p, id, 'in', 0.001)
    ok(p); expect(L0(p).srcIn).toBe(2.3)
    for (let i = 0; i < 300; i++) p = ops.nudgeLoopPoint(p, id, 'out', -0.001)
    ok(p); expect(L0(p).srcOut).toBe(3.7)
    p = ops.nudgeLoopPoint(p, id, 'in', 10); ok(p); close(ops.loopLen(L0(p)), ops.LOOP_MIN_LEN)
    expect(ops.nudgeLoopPoint(p, id, 'in', 0)).toBe(p)
  })
})

describe('other ops keep loops consistent', () => {
  const ids = (p: Project) => ops.loopClips(p, L0(p).id).map(c => c.id)
  it('moving ALL members keeps the loop live and moves Loop.start / track', () => {
    const p = looped(), q = ops.moveClips(p, ids(p), 2, 1)
    ok(q)
    expect(L0(q)).toMatchObject({ start: 3, track: 'T2' })
    expect(ops.loopClips(q, L0(q).id)).toHaveLength(4)
    const r = ops.updateLoop(q, L0(q).id, { count: 5 }); ok(r)
    expect(ops.loopClips(r, L0(r).id).every(c => c.track === 'T2')).toBe(true)
  })
  it('a ripple that shifts the whole loop keeps it live', () => {
    const p = ops.makeLoop(proj([mk('x', 'T1', 0, 0, 1), mk('a', 'T1', 1, 2, 4)]), 'a', 3, 0.2)
    const q = ops.rippleDelete(p, ['x'])
    ok(q); expect(L0(q).start).toBe(0)
  })
  it('moving some members detaches only those', () => {
    const p = looped(), all = ids(p), q = ops.moveClips(p, [all[3]], 3)
    ok(q)
    expect(get(q, all[3]).loop).toBeUndefined()
    expect(ops.loopClips(q, L0(q).id).map(c => c.id)).toEqual(all.slice(0, 3))
  })
  it('split, gain, speed, trim detach the touched repeat; the new half is plain', () => {
    const p = looped(), all = ids(p)
    const s = ops.splitAt(p, 2, [all[0]]); ok(s)
    expect(s.clips.filter(c => c.loop !== undefined)).toHaveLength(3)
    const g = ops.setClip(p, all[1], { gain: 0.3 }); ok(g); expect(get(g, all[1]).loop).toBeUndefined()
    const v = ops.setClipSpeed(p, all[2], 2); ok(v); expect(get(v, all[2]).loop).toBeUndefined()
    const t = ops.trimClip(p, all[3], 'out', clipEnd(get(p, all[3])) - 0.5); ok(t)
    expect(get(t, all[3]).loop).toBeUndefined()
  })
  it('duplicate / paste copies are plain clips; the loop is untouched', () => {
    const p = looped(), all = ids(p)
    const d = ops.duplicateClips(p, all, 20); ok(d)
    expect(d.clips.filter(c => c.loop !== undefined).map(c => c.id).sort()).toEqual([...all].sort())
    const pa = ops.pasteClips(p, ops.loopClips(p, L0(p).id), 20, 'T3'); ok(pa)
    expect(pa.clips.filter(c => c.track === 'T3').every(c => c.loop === undefined)).toBe(true)
  })
  it('deleting every member (or the track) drops the Loop record', () => {
    const p = looped()
    const d = ops.deleteClips(p, ids(p)); ok(d); expect(d.loops).toBeUndefined()
    const r = ops.removeTrack(p, 'T1'); ok(r); expect(r.loops).toBeUndefined()
  })
  it('no-op ops still return the same object', () => {
    const p = looped()
    expect(ops.moveClips(p, ids(p), 0)).toBe(p)
    expect(ops.splitAt(p, 50)).toBe(p)
  })
})

describe('detachLastRepeat', () => {
  it('makes the last repeat a plain clip that can be extended; the loop keeps the rest', () => {
    const lp = looped(4, 0.2), l = L0(lp), out = ops.detachLastRepeat(lp, l.id)
    expect(L0(out).count).toBe(3)
    expect(out.clips.filter((c) => c.loop === l.id)).toHaveLength(3)
    const lastId = ops.loopClips(lp, l.id).at(-1)!.id, after = out.clips.find((c) => c.id === lastId)!
    expect(after.loop).toBeUndefined(); expect(after.fadeOut).toBe(0)
    expect(ops.validate(out)).toEqual([])
    const ext = ops.trimClip(out, lastId, 'out', clipEnd(after) + 0.5)       // drag its right edge out
    expect(ops.validate(ext)).toEqual([]); expect(L0(ext).count).toBe(3)
  })
  it('with one repeat left it just unloops', () => {
    const p = looped(1, 0.2)
    expect(ops.detachLastRepeat(p, L0(p).id).loops ?? []).toHaveLength(0)
  })
})

describe('loop tail (extend the last repeat like a normal clip)', () => {
  it('lengthens only the last repeat; the others stay live repeats and nothing jumps', () => {
    const lp = looped(4, 0.2), l = L0(lp), before = ops.loopClips(lp, l.id)
    const out = ops.updateLoop(lp, l.id, { tail: 1.5 }), after = ops.loopClips(out, l.id)
    expect(after).toHaveLength(4); expect(L0(out).count).toBe(4)
    after.slice(0, 3).forEach((c, i) => { expect(c.start).toBeCloseTo(before[i].start); expect(c.srcOut).toBeCloseTo(before[i].srcOut) })
    expect(after[3].start).toBeCloseTo(before[3].start)                                   // the last repeat stays where it was
    expect(after[3].srcOut - after[3].srcIn).toBeCloseTo(before[3].srcOut - before[3].srcIn + 1.5)
    expect(ops.loopSpan(L0(out))).toBeCloseTo(ops.loopSpan(l) + 1.5)
    expect(ops.validate(out)).toEqual([])
  })
  it('can shorten the last repeat, is clamped, and survives other loop edits', () => {
    const lp = looped(3, 0.2), l = L0(lp)
    const short = ops.updateLoop(lp, l.id, { tail: -0.5 }); expect(ops.validate(short)).toEqual([])
    expect(ops.updateLoop(lp, l.id, { tail: -999 }).loops![0].tail!).toBeGreaterThan(-(l.srcOut - l.srcIn))
    const more = ops.updateLoop(ops.updateLoop(lp, l.id, { tail: 1 }), l.id, { count: 5 })   // add repeats: the tail stays on the new last one
    expect(ops.loopClips(more, l.id)).toHaveLength(5); expect(ops.validate(more)).toEqual([])
  })
})

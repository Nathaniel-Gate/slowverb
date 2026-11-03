import { describe, expect, it } from 'vitest'
import { HISTORY_CAP, canRedo, canUndo, createHistory, pushHistory, redo, undo } from './history'
import { deleteClips, splitAt, moveClips } from './ops'
import { mk, ok, proj } from './testkit'

const base = proj([mk('a', 'T1', 0, 0, 4), mk('b', 'T2', 1, 0, 2)])

describe('history', () => {
  it('starts with nothing to undo or redo', () => {
    const h = createHistory(base)
    expect(h).toEqual({ past: [], present: base, future: [] }); expect(canUndo(h)).toBe(false); expect(canRedo(h)).toBe(false)
    expect(undo(h)).toBe(h); expect(redo(h)).toBe(h)
  })
  it('push, undo, redo round trip restores identical projects', () => {
    const p1 = splitAt(base, 2), p2 = moveClips(p1, ['b'], 1), p3 = deleteClips(p2, ['a'])
    let h = createHistory(base)
    for (const p of [p1, p2, p3]) h = pushHistory(h, p)
    expect(h.present).toBe(p3); expect(h.past).toHaveLength(3)
    h = undo(h); expect(h.present).toBe(p2)
    h = undo(h); expect(h.present).toBe(p1)
    h = undo(h); expect(h.present).toBe(base); expect(canUndo(h)).toBe(false)
    h = redo(h); h = redo(h); h = redo(h)
    expect(h.present).toBe(p3); expect(canRedo(h)).toBe(false)
    ok(h.present)
  })
  it('a new push after undo clears the redo branch', () => {
    let h = pushHistory(createHistory(base), splitAt(base, 2))
    h = undo(h); expect(h.future).toHaveLength(1)
    h = pushHistory(h, deleteClips(base, ['a']))
    expect(h.future).toEqual([]); expect(h.past).toEqual([base])
  })
  it('ignores identical projects (same object or equal JSON), incl. no-op ops', () => {
    const h = createHistory(base)
    expect(pushHistory(h, base)).toBe(h)
    expect(pushHistory(h, JSON.parse(JSON.stringify(base)))).toBe(h)
    expect(pushHistory(h, deleteClips(base, ['nope']))).toBe(h)
  })
  it('caps the past at 200, dropping the oldest', () => {
    let h = createHistory(base), p = base
    for (let i = 1; i <= HISTORY_CAP + 50; i++) { p = { ...p, name: `v${i}` }; h = pushHistory(h, p) }
    expect(h.past).toHaveLength(HISTORY_CAP)
    expect(h.past[0].name).toBe('v50'); expect(h.present.name).toBe(`v${HISTORY_CAP + 50}`)
    expect(HISTORY_CAP).toBe(200)
  })
  it('does not mutate the previous history object', () => {
    const h = createHistory(base), h2 = pushHistory(h, splitAt(base, 2))
    expect(h.past).toEqual([]); expect(undo(h2).future).toHaveLength(1); expect(h2.past).toHaveLength(1)
  })
})

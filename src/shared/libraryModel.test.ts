import { describe, expect, it } from 'vitest'
import type { Playlist } from './types'
import { addSongs, categoryOf, healLists, makeList, planMigration, removeSong, rewriteRef } from './libraryModel'

const L = (songs: string[], id = 'a'): Playlist => ({ id, name: id, created: 0, songs })

describe('categoryOf', () => {
  it('knows the two homes', () => {
    expect(categoryOf('Songs/a.mp3')).toBe('Songs'); expect(categoryOf('Sound bites/x/rain.wav')).toBe('Sound bites')
    expect(categoryOf('a.mp3')).toBeNull(); expect(categoryOf('Focus/a.mp3')).toBeNull(); expect(categoryOf('Songs')).toBeNull()
  })
})
describe('planMigration', () => {
  it('moves loose files into Songs and folder playlists into virtual playlists', () => {
    const p = planMigration(['helium.mp3', 'Focus/a.mp3', 'Focus/deep/b.mp3', 'Songs/keep.mp3'])
    expect(p.moves).toEqual([{ from: 'helium.mp3', to: 'Songs/helium.mp3' }, { from: 'Focus/a.mp3', to: 'Songs/Focus/a.mp3' }, { from: 'Focus/deep/b.mp3', to: 'Songs/Focus/deep/b.mp3' }])
    expect(p.lists).toEqual([{ name: 'Focus', songs: ['Songs/Focus/a.mp3', 'Songs/Focus/deep/b.mp3'] }])
  })
  it('never overwrites an existing file', () => {
    const p = planMigration(['a.mp3', 'Songs/a.mp3'])
    expect(p.moves).toEqual([{ from: 'a.mp3', to: 'Songs/a (1).mp3' }])
  })
  it('is a no-op for an already migrated library', () => { expect(planMigration(['Songs/a.mp3', 'Sound bites/r.wav']).moves).toEqual([]) })
})
describe('playlist upkeep', () => {
  it('adds without duplicates, removes only the reference', () => {
    expect(addSongs(L(['x']), ['x', 'y']).songs).toEqual(['x', 'y']); expect(removeSong(L(['x', 'y']), 'x').songs).toEqual(['y'])
    expect(makeList('i', 'N', 5)).toEqual({ id: 'i', name: 'N', created: 5, songs: [] })
  })
  it('rewrites references when the app moves a file, in every playlist', () => {
    const r = rewriteRef([L(['Songs/a.mp3', 'Songs/b.mp3'], '1'), L(['Songs/a.mp3'], '2'), L(['Songs/z.mp3'], '3')], 'Songs/a.mp3', 'Sound bites/a.mp3')
    expect(r.map((l) => l.songs)).toEqual([['Sound bites/a.mp3', 'Songs/b.mp3'], ['Sound bites/a.mp3'], ['Songs/z.mp3']])
  })
  it('heals: re-points a moved file by unique name, drops a deleted one, returns the same array when clean', () => {
    const lists = [L(['Songs/a.mp3', 'Songs/gone.mp3'])]
    const h = healLists(lists, ['Sound bites/a.mp3', 'Songs/other.mp3'])
    expect(h.lists[0].songs).toEqual(['Sound bites/a.mp3']); expect(h.dropped).toEqual(['Songs/gone.mp3']); expect(h.repointed).toBe(1)
    const clean = [L(['Songs/a.mp3'])]; expect(healLists(clean, ['Songs/a.mp3']).lists).toBe(clean)
  })
  it('does not guess when the name is ambiguous', () => {
    const h = healLists([L(['Songs/a.mp3'])], ['X/a.mp3', 'Y/a.mp3']); expect(h.lists[0].songs).toEqual([]); expect(h.dropped).toEqual(['Songs/a.mp3'])
  })
})

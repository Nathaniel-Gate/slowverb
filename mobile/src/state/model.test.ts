import { describe, expect, it } from 'vitest'
import type { Song } from '../platform/types'
import { catOf, categoryForImport, countInList, inCategory, listsIn, mergeLists, songRel, songsOfList, uniqueFile } from './model'
import { emptyManifest, recordSent } from '@shared/phoneModel'

const song = (id: string, over: Partial<Song> = {}): Song => ({ id, title: id, artist: '', duration: 1, size: 1, addedAt: 1, ...over })
const list = (id: string, songs: string[], category?: string) => ({ id, name: id, created: 1, songs, ...(category ? { category } : {}) })

describe('phone library model', () => {
  it('a song with no category is a Song; its path is category/file', () => {
    expect(catOf(song('a'))).toBe('Songs'); expect(catOf(song('a', { category: 'Nope' }))).toBe('Songs')
    expect(songRel(song('a', { category: 'White noise', file: 'Rain.m4a' }))).toBe('White noise/Rain.m4a')
    expect(songRel(song('legacy'))).toBe('Songs/legacy')
  })
  it('filters by category and lists by category (saved one, else first song)', () => {
    const all = [song('a'), song('b', { category: 'White noise' })]
    expect(inCategory(all, 'White noise').map((s) => s.id)).toEqual(['b'])
    const ls = [list('x', [], 'Sound bites'), list('y', ['White noise/z.m4a']), list('z', [])]
    expect(listsIn(ls, 'Sound bites').map((l) => l.id)).toEqual(['x']); expect(listsIn(ls, 'White noise').map((l) => l.id)).toEqual(['y']); expect(listsIn(ls, 'Songs').map((l) => l.id)).toEqual(['z'])
  })
  it('a playlist shows its songs in its own order and skips ones not on the phone', () => {
    const all = [song('a', { file: 'a.m4a' }), song('b', { file: 'b.m4a' })]
    const l = list('l', ['Songs/b.m4a', 'Songs/missing.m4a', 'Songs/a.m4a'])
    expect(songsOfList(all, l).map((s) => s.id)).toEqual(['b', 'a']); expect(countInList(all, l)).toBe(2)
  })
  it('picks a free file name inside the category', () => {
    const all = [song('a', { file: 'x.m4a' }), song('b', { file: 'x (1).m4a' }), song('c', { category: 'White noise', file: 'x.m4a' })]
    expect(uniqueFile(all, 'Songs', 'x.m4a')).toBe('x (2).m4a'); expect(uniqueFile(all, 'Songs', 'y.m4a')).toBe('y.m4a'); expect(uniqueFile(all, 'Sound bites', 'x.m4a')).toBe('x.m4a')
  })
  it('import category: what the Mac recorded, else the tab', () => {
    const m = recordSent(emptyManifest(), 'White noise/Rain.m4a', [])
    expect(categoryForImport('Rain.m4a', m, 'Songs')).toBe('White noise'); expect(categoryForImport('Other.m4a', m, 'Sound bites')).toBe('Sound bites')
    expect(categoryForImport('Other.m4a', null, 'junk')).toBe('Songs')
  })
  it('merging Mac playlists adds songs by id, keeps the phone name, never removes', () => {
    const merged = mergeLists([list('g', ['Songs/a.m4a'])], [{ ...list('g', ['Songs/b.m4a']), name: 'Renamed' }, list('n', ['Songs/c.m4a'], 'Songs')])
    expect(merged.map((l) => [l.id, l.name, l.songs])).toEqual([['g', 'g', ['Songs/a.m4a', 'Songs/b.m4a']], ['n', 'n', ['Songs/c.m4a']]])
  })
})

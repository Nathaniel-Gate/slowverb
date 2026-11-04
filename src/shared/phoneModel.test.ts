import { describe, expect, it } from 'vitest'
import { categoryByName, cleanManifest, emptyManifest, parseManifest, phoneCategory, phoneRel, recordSent } from './phoneModel'

const gym = { id: 'g1', name: 'Gym', created: 5, category: 'Songs' }

describe('phone model', () => {
  it('maps a library folder to its category folder, Songs by default', () => {
    expect(phoneCategory('Songs')).toBe('Songs'); expect(phoneCategory('Songs/Gym')).toBe('Songs')
    expect(phoneCategory('White noise')).toBe('White noise'); expect(phoneCategory('Sound bites/x/y')).toBe('Sound bites')
    expect(phoneCategory('')).toBe('Songs'); expect(phoneCategory('Old folder')).toBe('Songs')
    expect(phoneRel('White noise', 'Rain.m4a')).toBe('White noise/Rain.m4a')
  })
  it('records a sent file and creates / merges only the playlists it is in', () => {
    const a = recordSent(emptyManifest(), 'Songs/a.m4a', [gym])
    expect(a.files).toEqual(['Songs/a.m4a']); expect(a.playlists).toEqual([{ id: 'g1', name: 'Gym', created: 5, category: 'Songs', songs: ['Songs/a.m4a'] }])
    const b = recordSent(a, 'Songs/b.m4a', [{ ...gym, name: 'Gym 2' }])
    expect(b.playlists).toHaveLength(1); expect(b.playlists[0].name).toBe('Gym 2'); expect(b.playlists[0].songs).toEqual(['Songs/a.m4a', 'Songs/b.m4a'])
    const c = recordSent(b, 'White noise/r.m4a', [])   // in no playlist: only the file index grows
    expect(c.files).toEqual(['Songs/a.m4a', 'Songs/b.m4a', 'White noise/r.m4a']); expect(c.playlists).toEqual(b.playlists)
    expect(recordSent(c, 'Songs/a.m4a', [gym]).playlists[0].songs).toEqual(['Songs/a.m4a', 'Songs/b.m4a'])   // sending twice never duplicates
    expect(a.playlists[0].songs).toEqual(['Songs/a.m4a'])   // input untouched
  })
  it('reads a damaged or foreign file safely', () => {
    expect(parseManifest('not json')).toEqual(emptyManifest())
    const m = cleanManifest({ playlists: [{ id: 'x', name: ' Run ', songs: ['Songs/a.m4a', 3, 'Songs/a.m4a'], category: 'Nope' }, { id: 'x', name: 'dupe', songs: [] }, { name: 'no id' }, null], files: ['Songs/a.m4a', 9] })
    expect(m.playlists).toEqual([{ id: 'x', name: 'Run', created: 0, songs: ['Songs/a.m4a'] }]); expect(m.files).toEqual(['Songs/a.m4a'])
  })
  it('finds the category of a file by its name', () => {
    const m = recordSent(recordSent(emptyManifest(), 'White noise/Rain.m4a', []), 'Songs/a.m4a', [gym])
    expect(categoryByName(m, 'Rain.m4a')).toBe('White noise'); expect(categoryByName(m, 'a.m4a')).toBe('Songs'); expect(categoryByName(m, 'zzz.m4a')).toBeNull()
  })
})

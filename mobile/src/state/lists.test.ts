import { beforeEach, describe, expect, it } from 'vitest'
import { setPlatform } from '../platform'
import { memoryPlatform } from '../platform/testkit'
import { useLists } from './lists.store'

let mem: ReturnType<typeof memoryPlatform>
const settle = () => new Promise((r) => setTimeout(r, 0))
beforeEach(async () => { mem = memoryPlatform(); setPlatform(mem); useLists.setState({ lists: [], loaded: false }) })

describe('playlists store', () => {
  it('creates in a category, adds / toggles / removes songs, renames, deletes, and saves each change', async () => {
    await useLists.getState().load()
    const id = useLists.getState().create('  Gym ', 'Songs')
    useLists.getState().add(id, ['Songs/a.m4a', 'Songs/b.m4a', 'Songs/a.m4a'])
    useLists.getState().toggle(id, 'Songs/b.m4a'); useLists.getState().toggle(id, 'Songs/c.m4a')
    useLists.getState().rename(id, 'Run'); await settle()
    expect((await mem.loadLists())[0]).toMatchObject({ name: 'Run', category: 'Songs', songs: ['Songs/a.m4a', 'Songs/c.m4a'] })
    useLists.getState().removeSong(id, 'Songs/a.m4a'); useLists.getState().remove(id); await settle()
    expect(await mem.loadLists()).toEqual([])
  })
  it('never writes before the saved lists were read (an early write must not wipe them)', async () => {
    await mem.saveLists([{ id: 'k', name: 'Kept', created: 1, songs: [] }])
    useLists.getState().create('Early', 'Songs'); await settle()
    expect((await mem.loadLists()).map((l) => l.name)).toEqual(['Kept'])   // untouched
    await useLists.getState().load()
    expect(useLists.getState().lists.map((l) => l.name).sort()).toEqual(['Early', 'Kept'])
  })
  it('a moved song is followed, a deleted song is forgotten, Mac lists merge by id', async () => {
    await useLists.getState().load()
    const id = useLists.getState().create('L', 'Songs'); useLists.getState().add(id, ['Songs/a.m4a'])
    useLists.getState().rewrite('Songs/a.m4a', 'White noise/a.m4a'); expect(useLists.getState().lists[0].songs).toEqual(['White noise/a.m4a'])
    useLists.getState().merge([{ id, name: 'Mac', created: 1, songs: ['Songs/z.m4a'] }])
    expect(useLists.getState().lists[0]).toMatchObject({ name: 'L', songs: ['White noise/a.m4a', 'Songs/z.m4a'] })
    useLists.getState().forget('White noise/a.m4a'); expect(useLists.getState().lists[0].songs).toEqual(['Songs/z.m4a'])
  })
})

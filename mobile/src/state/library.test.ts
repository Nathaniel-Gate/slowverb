import { beforeEach, describe, expect, it } from 'vitest'
import { setPlatform } from '../platform'
import { fakeFile, memoryPlatform } from '../platform/testkit'
import { useLibrary } from './library.store'
import { getPos, savePos } from './positions'
import { installBrowserFakes } from '../audio/testkit'

let mem: ReturnType<typeof memoryPlatform>
beforeEach(() => {
  installBrowserFakes()
  mem = memoryPlatform(); setPlatform(mem); useLibrary.setState({ songs: [], loading: false })
})

describe('library store', () => {
  it('imports picked files with tags from the file name and lists them', async () => {
    mem.queue = [fakeFile('Artist - One.mp3'), fakeFile('Two.mp3')]
    expect(await useLibrary.getState().importFiles()).toBe(2)
    const s = useLibrary.getState().songs
    expect(s.map((x) => [x.artist, x.title])).toEqual([['Artist', 'One'], ['', 'Two']])
    useLibrary.setState({ songs: [] }); await useLibrary.getState().load()
    expect(useLibrary.getState().songs).toHaveLength(2)
    expect(useLibrary.getState().loading).toBe(false)
  })
  it('importing nothing (cancelled picker) adds 0, and re-importing the same file is skipped', async () => {
    expect(await useLibrary.getState().importFiles()).toBe(0)
    mem.queue = [fakeFile('Same.mp3')]; await useLibrary.getState().importFiles()
    mem.queue = [fakeFile('Same.mp3')]
    expect(await useLibrary.getState().importFiles()).toBe(0)
    expect(useLibrary.getState().songs).toHaveLength(1)
  })
  it('remove deletes the song, its audio and its resume position', async () => {
    mem.queue = [fakeFile('X.mp3')]; await useLibrary.getState().importFiles()
    const id = useLibrary.getState().songs[0].id; savePos(id, 42)
    await useLibrary.getState().remove(id)
    expect(useLibrary.getState().songs).toEqual([]); expect(mem.blobs.size).toBe(0); expect(getPos(id)).toBe(0)
  })
  it('setSongFx and rename persist through the platform', async () => {
    mem.queue = [fakeFile('Y.mp3')]; await useLibrary.getState().importFiles()
    const id = useLibrary.getState().songs[0].id
    const fx = { speed: 0.8, pitchLock: false, wet: 0.4, decay: 4.5, damping: 0.4 }
    await useLibrary.getState().setSongFx(id, fx)
    await useLibrary.getState().rename(id, ' New ', 'Me')
    const stored = (await mem.listSongs())[0]
    expect(stored.fx).toEqual(fx); expect([stored.title, stored.artist]).toEqual(['New', 'Me'])
    expect(useLibrary.getState().songs[0].fx).toEqual(fx)
  })
})

describe('library: categories + playlists', () => {
  const lists = async () => (await import('./lists.store')).useLists
  it('imports into the chosen category, with a file name that is unique inside it', async () => {
    mem.queue = [fakeFile('Rain.mp3')]; await useLibrary.getState().importFiles('White noise')
    mem.queue = [fakeFile('Rain.mp3', 12)]; await useLibrary.getState().importFiles('White noise')
    const s = useLibrary.getState().songs
    expect(s.map((x) => [x.category, x.file])).toEqual([['White noise', 'Rain.mp3'], ['White noise', 'Rain (1).mp3']])
  })
  it('a picked playlists.json decides the category by file name and brings the Mac playlists in', async () => {
    const manifest = { version: 1, files: ['White noise/Rain.mp3', 'Songs/One.mp3'], playlists: [{ id: 'g', name: 'Gym', created: 1, category: 'Songs', songs: ['Songs/One.mp3'] }] }
    const json = { name: 'playlists.json', blob: new Blob([JSON.stringify(manifest)], { type: 'application/json' }) }
    mem.queue = [fakeFile('Rain.mp3'), fakeFile('One.mp3', 9), json]
    const L = await lists(); L.setState({ lists: [], loaded: true })
    expect(await useLibrary.getState().importFiles('Songs')).toBe(2)
    expect(useLibrary.getState().songs.map((x) => [x.file, x.category])).toEqual([['Rain.mp3', 'White noise'], ['One.mp3', 'Songs']])
    expect(L.getState().lists).toEqual([{ id: 'g', name: 'Gym', created: 1, category: 'Songs', songs: ['Songs/One.mp3'] }])
  })
  it('importing while a playlist is open also puts the new songs in it', async () => {
    const L = await lists(); L.setState({ lists: [], loaded: true }); const id = L.getState().create('Mix', 'Songs')
    mem.queue = [fakeFile('A.mp3'), fakeFile('B.mp3', 9)]; await useLibrary.getState().importFiles('Songs', id)
    expect(L.getState().lists[0].songs).toEqual(['Songs/A.mp3', 'Songs/B.mp3'])
  })
  it('move changes the home and playlists follow; remove drops the song from playlists', async () => {
    const L = await lists(); L.setState({ lists: [], loaded: true })
    mem.queue = [fakeFile('Song.mp3'), fakeFile('Song2.mp3', 9)]; await useLibrary.getState().importFiles('Songs')
    const [a, b] = useLibrary.getState().songs; const id = L.getState().create('Mix', 'Songs'); L.getState().add(id, ['Songs/Song.mp3', 'Songs/Song2.mp3'])
    await useLibrary.getState().move(a.id, 'Sound bites')
    expect(useLibrary.getState().songs.find((s) => s.id === a.id)).toMatchObject({ category: 'Sound bites', file: 'Song.mp3' })
    expect((await mem.listSongs()).find((s) => s.id === a.id)?.category).toBe('Sound bites')
    expect(L.getState().lists[0].songs).toEqual(['Sound bites/Song.mp3', 'Songs/Song2.mp3'])
    await useLibrary.getState().remove(b.id); expect(L.getState().lists[0].songs).toEqual(['Sound bites/Song.mp3'])
  })
})

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

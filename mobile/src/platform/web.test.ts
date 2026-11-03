import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
import { createWebPlatform } from './web'

const meta = (title: string) => ({ title, artist: 'A', duration: 10, size: 4, addedAt: 1 })
const blob = () => new Blob(['abcd'], { type: 'audio/mpeg' })

describe('web platform (IndexedDB)', () => {
  it('put, list, update, url, delete', async () => {
    const p = createWebPlatform(new IDBFactory())
    expect(await p.listSongs()).toEqual([])
    const s = await p.putSong(meta('One'), blob())
    await p.putSong(meta('Two'), blob())
    expect((await p.listSongs()).map((x) => x.title).sort()).toEqual(['One', 'Two'])
    await p.updateSong(s.id, { title: 'Uno', fx: { speed: 0.8, pitchLock: false, wet: 0.4, decay: 4, damping: 0.4 } })
    const back = (await p.listSongs()).find((x) => x.id === s.id)!
    expect(back.title).toBe('Uno'); expect(back.fx?.speed).toBe(0.8)
    expect(await p.getSongUrl(s.id)).toMatch(/^blob:/)
    expect(await p.getSongUrl(s.id)).toBe(await p.getSongUrl(s.id)) // cached
    await p.deleteSong(s.id)
    expect((await p.listSongs()).map((x) => x.title)).toEqual(['Two'])
    await expect(p.getSongUrl(s.id)).rejects.toThrow()
  })
  it('persists across platform instances on the same database', async () => {
    const idb = new IDBFactory()
    await createWebPlatform(idb).putSong(meta('Kept'), blob())
    expect((await createWebPlatform(idb).listSongs()).map((x) => x.title)).toEqual(['Kept'])
  })
})

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
  it('stores playlists, and upgrades a version 1 database without losing songs', async () => {
    const idb = new IDBFactory()
    await new Promise<void>((res, rej) => {   // a phone that ran the first release: songs + blobs only
      const o = idb.open('slowverb', 1)
      o.onupgradeneeded = () => { const songs = o.result.createObjectStore('songs', { keyPath: 'id' }); o.result.createObjectStore('blobs'); songs.put({ id: 'old', title: 'Old', artist: '', duration: 1, size: 1, addedAt: 1 }) }
      o.onsuccess = () => { o.result.close(); res() }; o.onerror = () => rej(o.error)
    })
    const p = createWebPlatform(idb)
    expect((await p.listSongs()).map((x) => x.title)).toEqual(['Old'])
    expect(await p.loadLists()).toEqual([])
    await p.saveLists([{ id: 'l', name: 'L', created: 1, songs: ['Songs/a.m4a'] }])
    expect(await createWebPlatform(idb).loadLists()).toEqual([{ id: 'l', name: 'L', created: 1, songs: ['Songs/a.m4a'] }])
  })
})

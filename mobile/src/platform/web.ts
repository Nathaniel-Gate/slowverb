import { CONFIG } from '../config'
import type { Platform, Song } from './types'
import { newId, pickViaInput } from './util'

const { name: DB, version: VER, songs: SONGS, blobs: BLOBS } = CONFIG.db
const req = <T,>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error) })
const finished = (tx: IDBTransaction) => new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error) })

/** Browser platform: IndexedDB (a `songs` store for metadata, a `blobs` store for the audio files). `idb` is injectable for tests. */
export function createWebPlatform(idb: IDBFactory = indexedDB): Platform {
  let dbp: Promise<IDBDatabase> | null = null
  const db = () => dbp ??= new Promise<IDBDatabase>((res, rej) => {
    const open = idb.open(DB, VER)
    open.onupgradeneeded = () => {
      open.result.createObjectStore(SONGS, { keyPath: 'id' })
      open.result.createObjectStore(BLOBS)
    }
    open.onsuccess = () => res(open.result)
    open.onerror = () => rej(open.error)
  })
  const urls = new Map<string, string>() // one object URL per song, revoked on delete

  return {
    pickAudioFiles: pickViaInput,
    async putSong(meta, data) {
      const song: Song = { ...meta, id: newId() }
      const tx = (await db()).transaction([SONGS, BLOBS], 'readwrite')
      tx.objectStore(SONGS).put(song); tx.objectStore(BLOBS).put(data, song.id)
      await finished(tx)
      return song
    },
    async listSongs() {
      return req((await db()).transaction(SONGS).objectStore(SONGS).getAll() as IDBRequest<Song[]>)
    },
    async getSongUrl(id) {
      const hit = urls.get(id); if (hit) return hit
      const blob = await req((await db()).transaction(BLOBS).objectStore(BLOBS).get(id) as IDBRequest<Blob | undefined>)
      if (!blob) throw new Error(`No audio stored for song ${id}`)
      const url = URL.createObjectURL(blob); urls.set(id, url)
      return url
    },
    async deleteSong(id) {
      const tx = (await db()).transaction([SONGS, BLOBS], 'readwrite')
      tx.objectStore(SONGS).delete(id); tx.objectStore(BLOBS).delete(id)
      await finished(tx)
      const url = urls.get(id); if (url) { URL.revokeObjectURL(url); urls.delete(id) }
    },
    async updateSong(id, patch) {
      const tx = (await db()).transaction(SONGS, 'readwrite'), store = tx.objectStore(SONGS)
      const cur = await req(store.get(id) as IDBRequest<Song | undefined>)
      if (cur) store.put({ ...cur, ...patch })
      await finished(tx)
    }
  }
}

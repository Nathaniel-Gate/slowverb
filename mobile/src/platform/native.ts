import { Capacitor } from '@capacitor/core'
import type { Playlist } from '@shared/types'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { CONFIG } from '../config'
import type { Platform, Song } from './types'
import { extFor, newId, pickViaInput } from './util'

type Rec = Song & { ext: string }
const { nativeSongsDir: DIR, nativeMetaFile: META, nativeListsFile: LISTS, nativeChunkBytes: CHUNK } = CONFIG
const dir = Directory.Documents
const pathOf = (r: { id: string; ext: string }) => `${DIR}/${r.id}.${r.ext}`

function toBase64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** iPhone platform: audio files in Documents/songs/<id>.<ext> (visible in Files), metadata in Documents/songs/library.json, playlists in Documents/songs/playlists.json. */
export function createNativePlatform(): Platform {
  let recs: Rec[] | null = null
  let chain: Promise<unknown> = Promise.resolve() // serialises metadata writes
  const load = async (): Promise<Rec[]> => {
    if (recs) return recs
    try {
      const r = await Filesystem.readFile({ path: META, directory: dir, encoding: Encoding.UTF8 })
      recs = JSON.parse(String(r.data)) as Rec[]
    } catch { recs = [] } // first run: no file yet
    return recs
  }
  const persist = () => {
    const next = chain.then(() => Filesystem.writeFile({ path: META, directory: dir, encoding: Encoding.UTF8, recursive: true, data: JSON.stringify(recs ?? []) }))
    chain = next.catch(() => undefined)
    return next.then(() => undefined)
  }
  const strip = ({ ext: _ext, ...song }: Rec): Song => song

  return {
    pickAudioFiles: pickViaInput, // WKWebView opens the Files app (incl. iCloud Drive) for a file input
    async putSong(meta, data) {
      const list = await load()
      const rec: Rec = { ...meta, id: newId(), ext: extFor(data) }
      for (let off = 0; off === 0 || off < data.size; off += CHUNK) {
        const part = toBase64(new Uint8Array(await data.slice(off, off + CHUNK).arrayBuffer()))
        if (off === 0) await Filesystem.writeFile({ path: pathOf(rec), directory: dir, recursive: true, data: part })
        else await Filesystem.appendFile({ path: pathOf(rec), directory: dir, data: part })
      }
      list.push(rec)
      await persist()
      return strip(rec)
    },
    async listSongs() { return (await load()).map(strip) },
    async getSongUrl(id) {
      const rec = (await load()).find((r) => r.id === id)
      if (!rec) throw new Error(`Unknown song ${id}`)
      const { uri } = await Filesystem.getUri({ path: pathOf(rec), directory: dir })
      return Capacitor.convertFileSrc(uri)
    },
    async deleteSong(id) {
      const list = await load(), rec = list.find((r) => r.id === id)
      if (!rec) return
      recs = list.filter((r) => r.id !== id)
      await persist()
      await Filesystem.deleteFile({ path: pathOf(rec), directory: dir }).catch(() => undefined)
    },
    async updateSong(id, patch) {
      const list = await load(), i = list.findIndex((r) => r.id === id)
      if (i < 0) return
      list[i] = { ...list[i], ...patch }
      await persist()
    },
    async loadLists() {
      try {
        const r = await Filesystem.readFile({ path: LISTS, directory: dir, encoding: Encoding.UTF8 })
        const v = JSON.parse(String(r.data)); return Array.isArray(v) ? v as Playlist[] : []
      } catch { return [] } // first run: no file yet
    },
    async saveLists(lists) {
      const next = chain.then(() => Filesystem.writeFile({ path: LISTS, directory: dir, encoding: Encoding.UTF8, recursive: true, data: JSON.stringify(lists) }))
      chain = next.catch(() => undefined)
      await next
    }
  }
}

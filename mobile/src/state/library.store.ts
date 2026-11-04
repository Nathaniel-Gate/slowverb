import { DEFAULT_CATEGORY } from '@shared/config'
import { parseManifest, type PhoneManifest } from '@shared/phoneModel'
import type { Fx } from '@shared/types'
import { create } from 'zustand'
import { platform, type Song } from '../platform'
import { readTags } from '../platform/tags'
import { useLists } from './lists.store'
import { categoryForImport, catOf, isManifestFile, songRel, uniqueFile } from './model'
import { clearPos } from './positions'

type S = {
  songs: Song[]; loading: boolean
  load(): Promise<void>
  /** Opens the picker. Audio goes to the category the Mac sent it from (per playlists.json), else `category`; a picked playlists.json is merged into the playlists.
   *  `into` = a playlist id to also put the new songs in. Resolves with how many songs were added. */
  importFiles(category?: string, into?: string | null): Promise<number>
  remove(id: string): Promise<void>
  setSongFx(id: string, fx: Fx): Promise<void>
  rename(id: string, title: string, artist?: string): Promise<void>
  move(id: string, category: string): Promise<void>   // change a song's home; playlists that held it follow
}
const byAdded = (a: Song, b: Song) => a.addedAt - b.addedAt // oldest first: imports append, like the Mac playlists

export const useLibrary = create<S>((set, get) => {
  const patch = (id: string, p: Partial<Song>) => set({ songs: get().songs.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  return {
    songs: [], loading: false,
    async load() {
      set({ loading: true })
      try {
        const [songs] = await Promise.all([platform.listSongs(), useLists.getState().load()])
        set({ songs: songs.sort(byAdded) })
      } finally { set({ loading: false }) }
    },
    async importFiles(category = DEFAULT_CATEGORY, into = null) {
      const picked = await platform.pickAudioFiles() // first await: keeps the tap's user gesture for the file picker
      let manifest: PhoneManifest | null = null
      for (const f of picked.filter((p) => isManifestFile(p.name))) {
        try {
          const m = parseManifest(await f.blob.text())
          manifest = manifest ? { version: 1, playlists: [...manifest.playlists, ...m.playlists], files: [...manifest.files, ...m.files] } : m
        } catch (e) { console.warn('could not read', f.name, e) }
      }
      if (manifest) useLists.getState().merge(manifest.playlists)
      let added = 0
      const rels: string[] = []
      for (const f of picked.filter((p) => !isManifestFile(p.name))) {
        try {
          const t = await readTags(f)
          const dupe = get().songs.some((s) => s.title === t.title && s.artist === t.artist && s.size === f.blob.size)
          if (dupe) continue
          const cat = categoryForImport(f.name, manifest, category), file = uniqueFile(get().songs, cat, f.name)
          const song = await platform.putSong({ title: t.title, artist: t.artist, duration: t.duration, size: f.blob.size, addedAt: Date.now() + added, category: cat, file }, f.blob)
          set({ songs: [...get().songs, song].sort(byAdded) }); added++; rels.push(songRel(song))
        } catch (e) { console.warn('import failed for', f.name, e) } // one bad file must not sink the batch
      }
      if (into && rels.length) useLists.getState().add(into, rels)
      return added
    },
    async remove(id) {
      const song = get().songs.find((s) => s.id === id)
      await platform.deleteSong(id); clearPos(id)
      set({ songs: get().songs.filter((s) => s.id !== id) })
      if (song) useLists.getState().forget(songRel(song))
    },
    async setSongFx(id, fx) { await platform.updateSong(id, { fx }); patch(id, { fx }) },
    async rename(id, title, artist) {
      const p: Partial<Song> = { title: title.trim() || 'Untitled' }
      if (artist !== undefined) p.artist = artist.trim()
      await platform.updateSong(id, p); patch(id, p)
    },
    async move(id, category) {
      const song = get().songs.find((s) => s.id === id); if (!song || catOf(song) === category) return
      const file = uniqueFile(get().songs.filter((s) => s.id !== id), category, song.file ?? song.id), from = songRel(song)
      await platform.updateSong(id, { category, file }); patch(id, { category, file })
      useLists.getState().rewrite(from, `${category}/${file}`)
    }
  }
})

import type { Fx } from '@shared/types'
import { create } from 'zustand'
import { platform, type Song } from '../platform'
import { readTags } from '../platform/tags'
import { clearPos } from './positions'

type S = {
  songs: Song[]; loading: boolean
  load(): Promise<void>
  importFiles(): Promise<number>           // opens the picker; resolves with how many songs were added
  remove(id: string): Promise<void>
  setSongFx(id: string, fx: Fx): Promise<void>
  rename(id: string, title: string, artist?: string): Promise<void>
}
const byAdded = (a: Song, b: Song) => a.addedAt - b.addedAt // oldest first: imports append, like the Mac playlists

export const useLibrary = create<S>((set, get) => {
  const patch = (id: string, p: Partial<Song>) => set({ songs: get().songs.map((s) => (s.id === id ? { ...s, ...p } : s)) })
  return {
    songs: [], loading: false,
    async load() {
      set({ loading: true })
      try { set({ songs: (await platform.listSongs()).sort(byAdded) }) } finally { set({ loading: false }) }
    },
    async importFiles() {
      const picked = await platform.pickAudioFiles() // first await: keeps the tap's user gesture for the file picker
      let added = 0
      for (const f of picked) {
        try {
          const t = await readTags(f)
          const dupe = get().songs.some((s) => s.title === t.title && s.artist === t.artist && s.size === f.blob.size)
          if (dupe) continue
          const song = await platform.putSong({ title: t.title, artist: t.artist, duration: t.duration, size: f.blob.size, addedAt: Date.now() + added }, f.blob)
          set({ songs: [...get().songs, song].sort(byAdded) }); added++
        } catch (e) { console.warn('import failed for', f.name, e) } // one bad file must not sink the batch
      }
      return added
    },
    async remove(id) {
      await platform.deleteSong(id); clearPos(id)
      set({ songs: get().songs.filter((s) => s.id !== id) })
    },
    async setSongFx(id, fx) { await platform.updateSong(id, { fx }); patch(id, { fx }) },
    async rename(id, title, artist) {
      const p: Partial<Song> = { title: title.trim() || 'Untitled' }
      if (artist !== undefined) p.artist = artist.trim()
      await platform.updateSong(id, p); patch(id, p)
    }
  }
})

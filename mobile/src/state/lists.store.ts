import { addSongs, makeList, removeSong, rewriteRef } from '@shared/libraryModel'
import type { Playlist } from '@shared/types'
import { create } from 'zustand'
import { platform } from '../platform'
import { mergeLists } from './model'

/** Virtual playlists (a song can be in many; deleting a list never touches songs), one category each. Saved through the platform after every change,
 *  but never before they have been read (an early write must not replace the real lists with an empty one). */
type S = {
  lists: Playlist[]; loaded: boolean
  load(): Promise<void>
  create(name: string, category: string): string
  rename(id: string, name: string): void
  remove(id: string): void
  add(id: string, rels: string[]): void
  removeSong(id: string, rel: string): void
  toggle(id: string, rel: string): void
  rewrite(from: string, to: string): void      // a song moved category: every list that held it follows
  forget(rel: string): void                    // a song was deleted
  merge(incoming: Playlist[]): void            // playlists.json from the Mac
}
const newId = () => globalThis.crypto?.randomUUID?.() ?? `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

export const useLists = create<S>((set, get) => {
  const put = (lists: Playlist[]) => { set({ lists }); if (get().loaded) void platform.saveLists(lists).catch((e) => console.warn('save lists failed', e)) }
  return {
    lists: [], loaded: false,
    async load() {
      const read = await platform.loadLists().catch(() => [] as Playlist[])
      set({ lists: mergeLists(read, get().lists), loaded: true })   // anything created before the read finished is kept
    },
    create(name, category) { const id = newId(); put([...get().lists, { ...makeList(id, name.trim() || 'Playlist', Date.now()), category }]); return id },
    rename: (id, name) => { if (name.trim()) put(get().lists.map((l) => (l.id === id ? { ...l, name: name.trim() } : l))) },
    remove: (id) => put(get().lists.filter((l) => l.id !== id)),
    add: (id, rels) => put(get().lists.map((l) => (l.id === id ? addSongs(l, rels) : l))),
    removeSong: (id, rel) => put(get().lists.map((l) => (l.id === id ? removeSong(l, rel) : l))),
    toggle(id, rel) { put(get().lists.map((l) => (l.id !== id ? l : l.songs.includes(rel) ? removeSong(l, rel) : addSongs(l, [rel])))) },
    rewrite: (from, to) => put(rewriteRef(get().lists, from, to)),
    forget: (rel) => { if (get().lists.some((l) => l.songs.includes(rel))) put(get().lists.map((l) => removeSong(l, rel))) },
    merge: (incoming) => { if (incoming.length) put(mergeLists(get().lists, incoming)) }
  }
})

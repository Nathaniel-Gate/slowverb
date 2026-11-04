import { create } from 'zustand'
import { CATEGORIES, DEFAULT_CATEGORY } from '../../../../shared/config'
import { addSongs, listCategory, healLists, makeList, removeSong, rewriteRef } from '../../../../shared/libraryModel'
import type { Playlist } from '../../../../shared/types'

/** Virtual playlists (many-to-many, by path relative to the library root) + which sidebar view is showing.
 *  Folders are a song's ONE home (see playlists.store); these lists never move or copy a file. Saved to <root>/.slowverb/playlists.json. */
type S = {
  loaded: boolean   // true once the saved playlists have been read; nothing is written back before that (an early quit must never save an empty list over the real one)
  lists: Playlist[]; mode: 'files' | 'lists'; listSel: string | null   // listSel null = all songs
  setMode(m: 'files' | 'lists'): void
  selectList(id: string | null): void
  replace(lists: Playlist[]): void
  create(name: string, category?: string): string
  rename(id: string, name: string): void
  remove(id: string): void
  add(ids: string[], rels: string[]): void
  toggle(id: string, rel: string): void
  removeSong(id: string, rel: string): void
  rewrite(from: string, to: string): void
  heal(existing: string[]): void
}
export const useLists = create<S>((set, get) => ({
  loaded: false, lists: [], mode: 'files', listSel: null,
  setMode: (mode) => set({ mode }),
  selectList: (listSel) => set({ listSel }),
  replace: (lists) => set({ lists, loaded: true }),
  create(name, category) { const id = crypto.randomUUID(); set({ lists: [...get().lists, { ...makeList(id, name.trim(), Date.now()), ...(category ? { category } : {}) }] }); return id },
  rename: (id, name) => name.trim() && set({ lists: get().lists.map((l) => (l.id === id ? { ...l, name: name.trim() } : l)) }),
  remove: (id) => set({ lists: get().lists.filter((l) => l.id !== id), listSel: get().listSel === id ? null : get().listSel }),
  add: (ids, rels) => set({ lists: get().lists.map((l) => (ids.includes(l.id) ? addSongs(l, rels) : l)) }),
  toggle(id, rel) { set({ lists: get().lists.map((l) => (l.id !== id ? l : l.songs.includes(rel) ? removeSong(l, rel) : addSongs(l, [rel]))) }) },
  removeSong: (id, rel) => set({ lists: get().lists.map((l) => (l.id === id ? removeSong(l, rel) : l)) }),
  rewrite: (from, to) => set({ lists: rewriteRef(get().lists, from, to) }),
  heal(existing) {
    const h = healLists(get().lists, existing)
    if (h.lists !== get().lists) { console.info(`[lists] healed: ${h.repointed} re-pointed by name, ${h.dropped.length} dropped`, h.dropped); set({ lists: h.lists }) }
  }
}))

export const catOfList = (l: Playlist) => listCategory(l, CATEGORIES, DEFAULT_CATEGORY)

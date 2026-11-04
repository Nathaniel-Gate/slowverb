import { DEFAULT_CATEGORY } from '@shared/config'
import { create } from 'zustand'

/** Which part of the library the Library screen shows: a category tab, then either all its songs or its playlists (and one open playlist). */
type S = {
  category: string; view: 'songs' | 'lists'; listId: string | null
  setCategory(c: string): void
  setView(v: 'songs' | 'lists'): void
  openList(id: string | null): void
}
export const useNav = create<S>((set) => ({
  category: DEFAULT_CATEGORY, view: 'songs', listId: null,
  setCategory: (category) => set({ category, listId: null }),
  setView: (view) => set({ view, listId: null }),
  openList: (listId) => set({ listId, view: 'lists' })
}))

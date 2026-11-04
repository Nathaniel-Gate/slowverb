import type { Track } from '../../../../shared/types'
import { fileRel, usePlaylists } from '../playlists/playlists.store'
import { useLibrary } from '../library/library.store'
import { useAddPopup, type Placement } from './addPopup.store'
import { useLists } from './lists.store'

/** After files are in the library: set their artist, join the chosen playlists (creating the new one if named). `paths` are absolute. */
export function joinLists(paths: string[], p: Placement) {
  useLibrary.getState().setArtist(paths, p.artist)
  const L = useLists.getState(), root = usePlaylists.getState().root
  const ids = [...p.listIds]; if (p.newList.trim()) ids.push(L.create(p.newList, p.category))
  const rels = paths.map((x) => fileRel(root, x)).filter((r): r is string => !!r)
  if (ids.length && rels.length) L.add(ids, rels)
}
/** Dropped/imported files: ask where they go, copy them into that category, add to playlists. Returns the NEW tracks (empty if cancelled). */
export async function placeFiles(paths: string[], what: string, preLists: string[] = [], category?: string): Promise<Track[]> {
  const p = await useAddPopup.getState().ask(what, preLists, category); if (!p) return []
  const { placed, added } = await usePlaylists.getState().importPlaced(paths, p.category)
  joinLists(placed, p)
  return added
}

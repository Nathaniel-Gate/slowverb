import { create } from 'zustand'
import type { Track } from '../../../../shared/types'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'
import { useLists } from '../lists/lists.store'

/** FOLDERS = a song's one home (Songs/, Sound bites/ and sub-folders). Virtual playlists live in ../lists. A folder is a path under the library root. rel = path relative to root ('' = loose files in the root). sel null = all songs. */
type S = {
  root: string; folders: string[]; sel: string | null
  select(rel: string | null): void
  refresh(): Promise<void>
  create(parent: string, name: string): Promise<void>
  rename(rel: string, name: string): Promise<void>
  trash(rel: string): Promise<void>
  moveTrack(id: string, toRel: string): Promise<void>
  importFiles(paths: string[], toRel: string): Promise<Track[]>
  importPlaced(paths: string[], toRel: string): Promise<{ placed: string[]; added: Track[] }>
}
export const relOf = (root: string, path: string): string | null => {
  if (!root || !path.startsWith(root + '/')) return null
  const rest = path.slice(root.length + 1), i = rest.lastIndexOf('/')
  return i < 0 ? '' : rest.slice(0, i)
}
/** A song's path relative to the library root ('Songs/a.mp3'), or null if it is outside. */
export const fileRel = (root: string, path: string): string | null => (root && path.startsWith(root + '/') ? path.slice(root.length + 1) : null)
const join = (a: string, b: string) => (a ? `${a}/${b}` : b)

export const usePlaylists = create<S>((set, get) => ({
  root: '', folders: [], sel: null,
  select: (sel) => set({ sel }),
  /** Make the app's track list match the folder on disk (adds new files, drops deleted ones), then reload folders. */
  async refresh() {
    const { root, folders, files } = await window.api.sync()
    set({ root, folders })
    if (get().sel !== null && get().sel !== '' && !folders.includes(get().sel!)) set({ sel: null })
    const lib = useLibrary.getState(), have = new Set(lib.tracks.map((t) => t.path)), onDisk = new Set(files)
    const fresh = files.filter((f) => !have.has(f))
    const gone = lib.tracks.filter((t) => t.path.startsWith(root + '/') && !onDisk.has(t.path))
    gone.forEach((t) => { if (usePlayer.getState().cur === t.id) usePlayer.getState().stop(); lib.remove(t.id) })
    if (fresh.length) await lib.addPaths(fresh)
    if (files.length) useLists.getState().heal(files.map((f) => f.slice(root.length + 1)))   // playlist references follow what is really on disk (never when the scan came back empty: an unmounted folder must not wipe lists)
  },
  async create(parent, name) { if (!name.trim()) return; await window.api.createPlaylist(join(parent, name.trim())); await get().refresh() },
  async rename(rel, name) {
    if (!name.trim()) return
    const to = await window.api.renamePlaylist(rel, name)
    if (get().sel === rel) set({ sel: to })
    await get().refresh()
  },
  async trash(rel) { await window.api.trashPlaylist(rel); await get().refresh() },
  async moveTrack(id, toRel) {
    const t = useLibrary.getState().tracks.find((x) => x.id === id); if (!t || relOf(get().root, t.path) === toRel) return
    const from = fileRel(get().root, t.path), to = await window.api.moveTrack(t.path, toRel)
    useLibrary.getState().setPath(id, to)
    const toR = fileRel(get().root, to); if (from && toR) useLists.getState().rewrite(from, toR)   // playlists keep pointing at the moved song
    await get().refresh()
  },
  async importPlaced(paths, toRel) {
    const placed = await window.api.importInto(paths, toRel)
    const added = await useLibrary.getState().addPaths(placed)
    await get().refresh()
    return { placed, added }
  },
  async importFiles(paths, toRel) { return (await get().importPlaced(paths, toRel)).added }
}))

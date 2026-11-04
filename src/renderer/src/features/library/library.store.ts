import { create } from 'zustand'
import type { Fx, Track } from '../../../../shared/types'

type S = {
  tracks: Track[]
  add(files: File[]): Promise<Track[]>         // files/folders dropped from Finder (already inside the library); returns the NEW tracks
  addPaths(paths: string[]): Promise<Track[]>  // same, from absolute paths (downloads, folder watcher)
  remove(id: string): void
  moveBefore(dragId: string, targetId: string): void
  setPath(id: string, path: string): void
  setArtist(paths: string[], artist: string): void   // the artist chosen in the add popup, applied to the files just added
  setTrackFx(id: string, fx: Fx): void
  replace(tracks: Track[]): void
}

// addPaths calls are queued one at a time so a drop and the folder watcher can never both add the same file.
let queue: Promise<unknown> = Promise.resolve()

export const useLibrary = create<S>((set, get) => {
  const addNow = async (paths: string[]): Promise<Track[]> => {
    const found = await window.api.scan(paths)
    const seen = new Set(get().tracks.map((t) => t.path)), added: Track[] = []
    for (const r of found) if (!seen.has(r.path)) { seen.add(r.path); added.push({ ...r, id: crypto.randomUUID() }) }
    console.info(`[library] given ${paths.length}, scanned ${found.length}, new ${added.length}, duplicates ${found.length - added.length}`)
    if (added.length) set({ tracks: [...get().tracks, ...added] })
    return added
  }
  return {
    tracks: [],
    add: (files) => get().addPaths(files.map((f) => window.api.pathFor(f)).filter(Boolean)),
    addPaths: (paths) => (queue = queue.then(() => addNow(paths))) as Promise<Track[]>,
    remove: (id) => set({ tracks: get().tracks.filter((t) => t.id !== id) }),
    moveBefore(dragId, targetId) {
      const t = [...get().tracks], from = t.findIndex((x) => x.id === dragId)
      if (from < 0 || dragId === targetId) return
      const [x] = t.splice(from, 1); t.splice(t.findIndex((y) => y.id === targetId), 0, x); set({ tracks: t })
    },
    setPath: (id, path) => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, path } : t)) }),
    setArtist: (paths, artist) => set({ tracks: get().tracks.map((t) => (paths.includes(t.path) ? { ...t, artist } : t)) }),
    setTrackFx: (id, fx) => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, fx } : t)) }),
    replace: (tracks) => set({ tracks })
  }
})

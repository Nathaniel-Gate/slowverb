import { create } from 'zustand'
import type { Fx, Track } from '../../../../shared/types'

type S = {
  tracks: Track[]
  add(files: File[]): Promise<Track[]>   // files or folders dropped from Finder; returns the NEW tracks
  remove(id: string): void
  move(from: number, to: number): void
  setTrackFx(id: string, fx: Fx): void
  replace(tracks: Track[]): void
}
export const useLibrary = create<S>((set, get) => ({
  tracks: [],
  async add(files) {
    const found = await window.api.scan(files.map((f) => window.api.pathFor(f)).filter(Boolean))
    const seen = new Set(get().tracks.map((t) => t.path)), added: Track[] = []
    for (const r of found) if (!seen.has(r.path)) { seen.add(r.path); added.push({ ...r, id: crypto.randomUUID() }) }
    console.info(`[library] dropped ${files.length}, scanned ${found.length}, new ${added.length}, duplicates ${found.length - added.length}`)
    set({ tracks: [...get().tracks, ...added] })
    return added
  },
  remove: (id) => set({ tracks: get().tracks.filter((t) => t.id !== id) }),
  move(from, to) {
    const t = [...get().tracks]; const [x] = t.splice(from, 1); t.splice(to, 0, x); set({ tracks: t })
  },
  setTrackFx: (id, fx) => set({ tracks: get().tracks.map((t) => (t.id === id ? { ...t, fx } : t)) }),
  replace: (tracks) => set({ tracks })
}))

import { create } from 'zustand'

// Live (uncommitted) lane heights while a track-header handle is dragged. Timeline and TrackHeaders both read this,
// so rows and lanes resize together without writing history on every pointer move. Committed once on release.
type S = { live: Record<string, number>; setLive: (id: string, h: number | null) => void }
export const useLaneLive = create<S>(set => ({
  live: {},
  setLive: (id, h) => set(s => {
    const next = { ...s.live }
    if (h === null) delete next[id]; else next[id] = h
    return { live: next }
  })
}))

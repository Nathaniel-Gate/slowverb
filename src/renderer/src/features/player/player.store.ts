import { create } from 'zustand'
import { engine } from '../../audio/engine'
import { effectiveFx, useFx } from '../fx/fx.store'
import { useLibrary } from '../library/library.store'

type S = {
  cur: string | null; playing: boolean
  play(id: string): void; toggle(): void; next(dir?: 1 | -1): void; stop(): void; skip(sec: number): void; seek(sec: number): void
}
export const usePlayer = create<S>((set, get) => ({
  cur: null, playing: false,
  play(id) {
    const t = useLibrary.getState().tracks.find((x) => x.id === id); if (!t) return
    set({ cur: id })
    if (t.fx) useFx.getState().replace(t.fx)         // restore this track's remembered version
    engine.load(t.path, effectiveFx(useFx.getState())).catch((e) => console.error('[player] load failed', t.path, e))
  },
  toggle() {
    const { cur } = get(), tracks = useLibrary.getState().tracks
    if (!cur) { if (tracks[0]) get().play(tracks[0].id); return }
    if (!engine.loaded) return get().play(cur)
    if (engine.el.paused) engine.ctx.resume().then(() => engine.el.play()); else engine.el.pause()
  },
  next(dir = 1) {
    const tracks = useLibrary.getState().tracks; if (!tracks.length) return
    const i = tracks.findIndex((t) => t.id === get().cur)
    get().play(tracks[(i + dir + tracks.length) % tracks.length].id)
  },
  stop() { engine.clear(); set({ cur: null, playing: false }) },
  skip: (sec) => get().seek(engine.el.currentTime + sec),
  seek: (sec) => { engine.el.currentTime = Math.max(0, sec) }
}))

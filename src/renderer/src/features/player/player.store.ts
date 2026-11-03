import { create } from 'zustand'
import { engine } from '../../audio/engine'
import { useEditor } from '../../editor/editor.store'
import { isPristine } from '../../editor/pristine'
import { effectiveFx, useFx } from '../fx/fx.store'
import { useLibrary } from '../library/library.store'

// The player plays EXACTLY what the editor currently shows: if the song has an edit (anything beyond the untouched file), playback goes
// through the editor's transport (same graph as the editor, so cuts, gaps, fades, speed and effects are all heard). Untouched songs
// are played straight from the file as before. `viaEdit` says which one is active.
type S = {
  cur: string | null; playing: boolean; viaEdit: boolean
  play(id: string): void; select(id: string): void; toggle(): void; next(dir?: 1 | -1): void; stop(): void; skip(sec: number): void; seek(sec: number): void
  adoptEdit(id: string): void   // editor -> player hand-over: keep the shared transport running, the player now controls it
}
const ed = () => useEditor.getState()
let token = 0

export const usePlayer = create<S>((set, get) => {
  /** Make `id` the current song and load it. autoplay=false loads it ready at 0:00 without starting (select); true also starts it (play). */
  function start(id: string, autoplay: boolean) {
    const t = useLibrary.getState().tracks.find((x) => x.id === id); if (!t) return
    const mine = ++token
    set({ cur: id })
    if (t.fx) useFx.getState().replace(t.fx)         // restore this track's remembered version
    void (async () => {
      const p = await ed().prepare(t.path)           // the song's saved edit (null if none, or the editor is busy on another song)
      if (mine !== token) return
      if (p && !isPristine(p)) {                     // play the edit
        engine.el.pause(); set({ viaEdit: true })
        if (ed().playing) await ed().togglePlay()    // stop whatever the transport was doing
        ed().setPlayhead(0)
        if (autoplay) await ed().togglePlay()
        set({ playing: ed().playing })
        return
      }
      if (get().viaEdit && ed().playing) await ed().togglePlay()   // leave the edit transport
      set({ viaEdit: false })
      engine.load(t.path, effectiveFx(useFx.getState()), autoplay).catch((e) => console.error('[player] load failed', t.path, e))
      if (!autoplay) set({ playing: false })
    })()
  }

  return {
    cur: null, playing: false, viaEdit: false,
    play: (id) => start(id, true),
    select: (id) => start(id, false),
    toggle() {
      const { cur, viaEdit } = get(), tracks = useLibrary.getState().tracks
      if (!cur) { if (tracks[0]) get().play(tracks[0].id); return }
      if (viaEdit) { void ed().togglePlay(); return }
      if (!engine.loaded) return get().play(cur)
      if (engine.el.paused) engine.ctx.resume().then(() => engine.el.play()); else engine.el.pause()
    },
    next(dir = 1) {
      const tracks = useLibrary.getState().tracks; if (!tracks.length) return
      const i = tracks.findIndex((t) => t.id === get().cur)
      get().play(tracks[(i + dir + tracks.length) % tracks.length].id)
    },
    stop() { token++; if (get().viaEdit && ed().playing) void ed().togglePlay(); engine.clear(); set({ cur: null, playing: false, viaEdit: false }) },
    skip: (sec) => get().seek((get().viaEdit ? ed().now() : engine.el.currentTime) + sec),
    seek: (sec) => { if (get().viaEdit) ed().setPlayhead(Math.max(0, sec)); else engine.el.currentTime = Math.max(0, sec) },
    adoptEdit(id) { engine.el.pause(); set({ cur: id, viaEdit: true, playing: ed().playing }) }
  }
})

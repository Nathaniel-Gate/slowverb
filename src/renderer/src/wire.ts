// Glue between stores, the audio engine and disk. Everything cross-cutting lives here, nowhere else.
import type { Saved } from '../../shared/types'
import { engine } from './audio/engine'
import { effectiveFx, useFx } from './features/fx/fx.store'
import { useLibrary } from './features/library/library.store'
import { usePlayer } from './features/player/player.store'

export async function wire() {
  const saved = await window.api.load()
  if (saved) {
    useLibrary.getState().replace(saved.tracks ?? [])
    useFx.setState({ fx: saved.fx ?? useFx.getState().fx, preset: saved.preset, userPresets: saved.userPresets ?? [] })
    if (saved.cur && saved.tracks?.some((t) => t.id === saved.cur)) usePlayer.setState({ cur: saved.cur })
  }
  // fx -> engine; user edits also stamp the current track (per-track memory)
  let touched = useFx.getState().touched
  useFx.subscribe((s) => {
    engine.apply(effectiveFx(s))
    const cur = usePlayer.getState().cur
    if (s.touched !== touched) { touched = s.touched; if (cur) useLibrary.getState().setTrackFx(cur, s.fx) }
  })
  engine.el.addEventListener('play', () => usePlayer.setState({ playing: true }))
  engine.el.addEventListener('pause', () => usePlayer.setState({ playing: false }))
  engine.el.addEventListener('ended', () => usePlayer.getState().next(1))
  // persist (debounced)
  let timer: number | undefined
  const save = () => { clearTimeout(timer); timer = window.setTimeout(() => {
    const f = useFx.getState()
    const data: Saved = { tracks: useLibrary.getState().tracks, cur: usePlayer.getState().cur, fx: f.fx, preset: f.preset, userPresets: f.userPresets }
    window.api.save(data)
  }, 400) }
  useLibrary.subscribe(save); useFx.subscribe(save); usePlayer.subscribe(save)
}

// Debug handle for DevTools and the screenshot harness.
;(window as any).__sv = { engine, useLibrary, useFx, usePlayer }

// Glue between stores, the audio engine and disk. Everything cross-cutting lives here, nowhere else.
import type { Saved } from '../../shared/types'
import { engine } from './audio/engine'
import { useEditor } from './editor/editor.store'
import { effectiveFx, useFx } from './features/fx/fx.store'
import { useLibrary } from './features/library/library.store'
import { usePlayer } from './features/player/player.store'
import { usePlaylists } from './features/playlists/playlists.store'

export async function wire() {
  const saved = await window.api.load()
  if (saved) {
    useLibrary.getState().replace(saved.tracks ?? [])
    useFx.setState({ fx: saved.fx ?? useFx.getState().fx, preset: saved.preset, userPresets: saved.userPresets ?? [] })
    if (saved.cur && saved.tracks?.some((t) => t.id === saved.cur)) usePlayer.setState({ cur: saved.cur })
  }
  await usePlaylists.getState().refresh()                       // library folder is the source of truth for what exists
  window.api.onLibraryChanged(() => usePlaylists.getState().refresh())   // Finder edits, downloads
  // fx -> engine; user edits also stamp the current track (per-track memory)
  let touched = useFx.getState().touched
  useFx.subscribe((s) => {
    engine.apply(effectiveFx(s))
    const cur = usePlayer.getState().cur
    if (s.touched !== touched) { touched = s.touched; if (cur) useLibrary.getState().setTrackFx(cur, s.fx) }
  })
  engine.el.addEventListener('play', () => { usePlayer.setState({ playing: true }); if (useEditor.getState().playing) void useEditor.getState().togglePlay() })   // never both at once
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
  window.addEventListener('beforeunload', () => void useEditor.getState().flush())   // last edit never lost on quit
}

// Debug handle for DevTools and the screenshot harness.
;(window as any).__sv = { engine, useEditor, useLibrary, useFx, usePlayer, usePlaylists, exportCheck: async () => {
  const { renderVersion } = await import('./audio/offline')
  const { DEFAULT_FX } = await import('./config/fx')
  const t = useLibrary.getState().tracks[0], bytes = await (await fetch('media://local' + encodeURI(t.path))).arrayBuffer()
  const src = await new AudioContext().decodeAudioData(bytes), orig = await renderVersion(t.path, DEFAULT_FX)
  let maxDiff = 0; const a = src.getChannelData(0); for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - orig.channels[0][i]))
  const slow = await renderVersion(t.path, { ...DEFAULT_FX, speed: 0.8, wet: 0.4, decay: 4.5 })
  return { nullMaxDiff: maxDiff, srcSec: src.duration, origSec: orig.channels[0].length / orig.rate, slowSec: slow.channels[0].length / slow.rate, expectSlow: src.duration / 0.8 + 4.52 }
} }

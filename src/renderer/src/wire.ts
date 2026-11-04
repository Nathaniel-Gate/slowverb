import { mediaUrl } from '../../shared/mediaUrl'
// Glue between stores, the audio engine and disk. Everything cross-cutting lives here, nowhere else.
import type { Saved } from '../../shared/types'
import { engine } from './audio/engine'
import { useEditor } from './editor/editor.store'
import { editorTransport } from './editor/transport'
import { setMasterFallback } from './editor/master'
import * as ops from './editor/ops'
import { renderProject } from './editor/render'
import { buildGraph, loadBuffers } from './editor/schedule'
import { DEFAULT_FX } from './config/fx'
import { effectiveFx, useFx } from './features/fx/fx.store'
import { useLibrary } from './features/library/library.store'
import { usePlayer } from './features/player/player.store'
import { settingsOf, useSettings } from './features/settings/settings.store'
import { usePlaylists } from './features/playlists/playlists.store'
import { useLists } from './features/lists/lists.store'
import { placeFiles } from './features/lists/place'
import { useAmbience } from './features/ambience/ambience.store'
import { bindAmbience } from './features/ambience/bind'
import { bindSongColor } from './features/settings/songColor'
import { ambienceEngine } from './audio/ambienceEngine'

export async function wire() {
  const saved = await window.api.load()
  if (saved) {
    useLibrary.getState().replace(saved.tracks ?? [])
    useSettings.getState().replace(saved.settings)
    useAmbience.getState().hydrate(saved.settings)
    useFx.setState({ fx: saved.fx ?? useFx.getState().fx, preset: saved.preset, userPresets: saved.userPresets ?? [] })
    if (saved.cur && saved.tracks?.some((t) => t.id === saved.cur)) usePlayer.setState({ cur: saved.cur })
  }
  // one-time move into Songs/ + Sound bites/ (asks first; backs up; deletes nothing): repoint saved tracks, then load the playlists it created
  for (const m of await window.api.migrate()) { const t = useLibrary.getState().tracks.find((x) => x.path === m.from); if (t) useLibrary.getState().setPath(t.id, m.to) }
  useLists.getState().replace(await window.api.listsLoad())
  await usePlaylists.getState().refresh()                       // library folder is the source of truth for what exists
  window.api.onLibraryChanged(() => usePlaylists.getState().refresh())   // Finder edits, downloads
  // fx -> engine; user edits also stamp the current track (per-track memory)
  let touched = useFx.getState().touched
  useFx.subscribe((s) => {
    engine.apply(effectiveFx(s))
    const cur = usePlayer.getState().cur
    if (s.touched !== touched) { touched = s.touched; if (cur) useLibrary.getState().setTrackFx(cur, s.fx) }
  })
  engine.el.addEventListener('play', () => { usePlayer.setState({ playing: true }); if (useEditor.getState().playing) void useEditor.getState().togglePlay(); editorTransport.idle() })   // never both at once; the editor's output stream sleeps while the player plays
  // The editor sounds like the player: it follows this song's player version (speed + reverb) unless the Mix panel sets its own.
  setMasterFallback((p) => { const t = useLibrary.getState().tracks.find((x) => x.path === p.song); return useFx.getState().bypass ? DEFAULT_FX : (t?.fx ?? useFx.getState().fx) })
  const resync = () => { const e = useEditor.getState(); if (e.open && e.playing && e.project && !e.project.master) editorTransport.seek(e.project, e.buffers, editorTransport.position()) }
  useFx.subscribe((s, prev) => { if (s.fx !== prev.fx || s.bypass !== prev.bypass) resync() })
  useEditor.subscribe((s, prev) => {
    if (s.playing && !prev.playing) engine.idle()
    if (usePlayer.getState().viaEdit && s.playing !== prev.playing) {
      usePlayer.setState({ playing: s.playing })
      const end = s.project ? s.project.clips.reduce((m, c) => Math.max(m, c.start + (c.srcOut - c.srcIn) / (c.speed || 1)), 0) : 0
      if (!s.playing && !s.open && end > 0 && s.playhead >= end - 0.1 && useSettings.getState().autoAdvance) usePlayer.getState().next(1)   // the edit played to its end in the PLAYER view: next song (never from the editor view)
    }
  })   // and the player's stream sleeps while the editor plays
  engine.el.addEventListener('pause', () => usePlayer.setState({ playing: false }))
  engine.el.addEventListener('ended', () => { if (useSettings.getState().autoAdvance && !useEditor.getState().open) usePlayer.getState().next(1) })   // only in the player view, and only if switched on
  bindSongColor()
  bindAmbience()                                                // background sound: follows usePlayer.playing, saved via useSettings
  // persist (debounced)
  const saveLibraryNow = () => {
    const f = useFx.getState()
    const data: Saved = { tracks: useLibrary.getState().tracks, cur: usePlayer.getState().cur, fx: f.fx, preset: f.preset, userPresets: f.userPresets, settings: settingsOf(useSettings.getState()) }
    return window.api.save(data)
  }
  let timer: number | undefined
  const save = () => { clearTimeout(timer); timer = window.setTimeout(() => void saveLibraryNow(), 250) }
  let ltimer: number | undefined
  const saveLists = () => { clearTimeout(ltimer); ltimer = window.setTimeout(() => { if (useLists.getState().loaded) void window.api.listsSave(useLists.getState().lists) }, 250) }
  useLists.subscribe((s, prev) => { if (s.lists !== prev.lists) saveLists() })
  useLibrary.subscribe(save); useFx.subscribe(save); usePlayer.subscribe(save); useSettings.subscribe(save)
  const saveEverything = async () => { clearTimeout(timer); clearTimeout(ltimer); await Promise.allSettled([useEditor.getState().flush(), saveLibraryNow(), useLists.getState().loaded ? window.api.listsSave(useLists.getState().lists) : Promise.resolve()]) }
  window.addEventListener('beforeunload', () => void saveEverything())                      // belt
  window.addEventListener('blur', () => void saveEverything())                              // switching to another app
  document.addEventListener('visibilitychange', () => { if (document.hidden) void saveEverything() })
  window.api.onSaveNow(() => void saveEverything().finally(() => window.api.saveDone()))     // braces: main waits for this before closing the window
  void saveLibraryNow()
}

// Debug handle for DevTools and the screenshot harness.
;(window as any).__sv = { buildGraph, useSettings, ops, renderProject, loadBuffers, editorTransport, engine, useEditor, useLibrary, useFx, usePlayer, usePlaylists, useLists, placeFiles, useAmbience, ambienceEngine, exportCheck: async () => {
  const { renderVersion } = await import('./audio/offline')
  const { DEFAULT_FX } = await import('./config/fx')
  const t = useLibrary.getState().tracks[0], bytes = await (await fetch(mediaUrl(t.path))).arrayBuffer()
  const src = await new OfflineAudioContext(2, 1, 44100).decodeAudioData(bytes), orig = await renderVersion(t.path, DEFAULT_FX)
  let maxDiff = 0; const a = src.getChannelData(0); for (let i = 0; i < a.length; i++) maxDiff = Math.max(maxDiff, Math.abs(a[i] - orig.channels[0][i]))
  const slow = await renderVersion(t.path, { ...DEFAULT_FX, speed: 0.8, wet: 0.4, decay: 4.5 })
  return { nullMaxDiff: maxDiff, srcSec: src.duration, origSec: orig.channels[0].length / orig.rate, slowSec: slow.channels[0].length / slow.rate, expectSlow: src.duration / 0.8 + 4.52 }
} }

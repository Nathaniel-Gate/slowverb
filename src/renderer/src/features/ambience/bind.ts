import { ambienceEngine } from '../../audio/ambienceEngine'
import { useEditor } from '../../editor/editor.store'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'
import { usePlaylists } from '../playlists/playlists.store'
import { useSettings } from '../settings/settings.store'
import { ambienceSettingsOf, useAmbience } from './ambience.store'
import { soundBites } from './soundBites'

/** Wire the ambience store to its engine and to the settings. Call once from wire.ts (after settings are loaded).
 *  The sound runs only while: the switch is on AND at least one chosen Sound bite exists AND the player is playing
 *  (file or edit playback, usePlayer.playing) AND the Editor tab is not open (the editor playing on its own stays silent). */
export function bindAmbience() {
  let bites = new Map<string, string>(), seenTracks: unknown = null, seenRoot = ''
  const sync = () => {
    const a = useAmbience.getState(), lib = useLibrary.getState().tracks, root = usePlaylists.getState().root
    if (lib !== seenTracks || root !== seenRoot) { seenTracks = lib; seenRoot = root; bites = new Map(soundBites(lib, root).map((b) => [b.rel, b.path])) }
    const layers = a.sounds.flatMap((s) => { const path = bites.get(s.rel); return path ? [{ key: s.rel, url: path, db: s.level }] : [] })   // a chosen file that is gone is just skipped (the choice is kept)
    ambienceEngine.setMaster(a.level); ambienceEngine.setLayers(layers)
    if (a.on && layers.length && usePlayer.getState().playing && !useEditor.getState().open) void ambienceEngine.play(); else ambienceEngine.pause()
  }
  useAmbience.subscribe(sync)
  useLibrary.subscribe((s, prev) => { if (s.tracks !== prev.tracks) sync() })
  usePlaylists.subscribe((s, prev) => { if (s.root !== prev.root) sync() })
  usePlayer.subscribe((s, prev) => { if (s.playing !== prev.playing) sync() })
  useEditor.subscribe((s, prev) => { if (s.open !== prev.open) sync() })
  useAmbience.subscribe((a) => useSettings.getState().set(ambienceSettingsOf(a)))   // -> useSettings -> debounced save
  sync()
}

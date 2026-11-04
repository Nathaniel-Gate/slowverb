import { AMBIENCE } from '@app/audio/ambience'
import { AmbienceEngine, type AmbienceLayer } from '@app/audio/ambienceEngine'
import type { AmbienceSound } from '@shared/types'
import { platform, type Song } from '../platform'
import { catOf, songRel } from '../state/model'
import { useAmbience } from '../state/ambience.store'
import { useLibrary } from '../state/library.store'
import { usePlayer } from '../state/player.store'
import { engine } from './engine'

/** The layers' own audio output (its own AudioContext, created on first use). Urls are ready blob / file URLs, so nothing to rewrite. */
export const layerEngine = new AmbienceEngine((u) => u)

/** Chosen layers + the phone library -> what the engine plays. Chosen tracks that are not on the phone are skipped (the choice is kept).
 *  A layer loops by default when it is White noise or has a queue; otherwise it plays through once. `urlOf` maps a song id to its playable URL. */
export function buildLayers(sounds: AmbienceSound[], songs: Song[], urlOf: (id: string) => string | undefined): AmbienceLayer[] {
  const byRel = new Map(songs.map((s) => [songRel(s), s]))
  return sounds.flatMap((s) => {
    const urls = [s.rel, ...(s.queue ?? [])].flatMap((r) => { const id = byRel.get(r)?.id, u = id ? urlOf(id) : undefined; return u ? [u] : [] })
    const first = byRel.get(s.rel)
    return urls.length ? [{ key: s.rel, urls, db: s.level, loop: s.loop ?? (!!s.queue?.length || (!!first && catOf(first) === AMBIENCE.category)) }] : []
  })
}
/** Every song id the chosen layers refer to. */
export const layerSongIds = (sounds: AmbienceSound[], songs: Song[]): string[] => {
  const byRel = new Map(songs.map((s) => [songRel(s), s.id]))
  return [...new Set(sounds.flatMap((s) => [s.rel, ...(s.queue ?? [])]).flatMap((r) => { const id = byRel.get(r); return id ? [id] : [] }))]
}

/** Wire layers to the player: they run only while the switch is on, at least one chosen track is on the phone, and the music is playing.
 *  Pausing the music fades them out and freezes them; playing resumes them exactly where they were. Call once at start-up. */
export function bindLayers() {
  const urls = new Map<string, string>()
  let token = 0
  const sync = async () => {
    const my = ++token, a = useAmbience.getState(), songs = useLibrary.getState().songs
    for (const id of layerSongIds(a.sounds, songs)) if (!urls.has(id)) { try { urls.set(id, await platform.getSongUrl(id)) } catch { /* unreadable: skipped */ } }
    if (my !== token) return   // a newer change took over
    const layers = buildLayers(a.sounds, songs, (id) => urls.get(id))
    layerEngine.setMaster(a.level); layerEngine.setLayers(layers)
    if (a.on && layers.length && usePlayer.getState().playing) void layerEngine.play(); else layerEngine.pause()
  }
  const run = () => { void sync() }
  engine.onUnlock(() => { if (useAmbience.getState().on) layerEngine.prime() })   // inside the tap that starts the music
  useAmbience.subscribe((s, p) => { if (s.on && !p.on) layerEngine.prime(); run() })      // switching layers on is a tap too
  useLibrary.subscribe((s, p) => { if (s.songs !== p.songs) run() })
  usePlayer.subscribe((s, p) => { if (s.playing !== p.playing) run() })
  run()
}

import { create } from 'zustand'
import type { Settings } from '../../../../shared/types'

/** Playback habits. Saved with the library. Change the defaults here. */
export const DEFAULT_SETTINGS: Settings = {
  playOnClick: false,     // clicking a song in the playlist starts it (off: it just selects/loads it; press play)
  playAfterAdd: false,    // a dropped or downloaded song starts playing as soon as it is added
  autoAdvance: true,      // when a song ends in the PLAYER view, start the next one (never happens in the editor view)
  ambienceOn: false,      // chosen Sound bites loop quietly under the music while the player plays
  ambienceLevel: -20,     // dB, master level of the whole ambience layer (quiet by default)
  ambienceSounds: []      // the chosen Sound bites ({ rel, level }), remembered by path relative to the library root
}
type S = Settings & { set(p: Partial<Settings>): void; replace(s?: Partial<Settings>): void }
export const useSettings = create<S>((set) => ({
  ...DEFAULT_SETTINGS,
  set: (p) => set(p),
  replace: (s) => set({ ...DEFAULT_SETTINGS, ...s })
}))
export const settingsOf = (s: S): Settings => ({ playOnClick: s.playOnClick, playAfterAdd: s.playAfterAdd, autoAdvance: s.autoAdvance, ambienceOn: s.ambienceOn, ambienceLevel: s.ambienceLevel, ambienceSounds: s.ambienceSounds })

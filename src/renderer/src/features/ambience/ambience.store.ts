import { create } from 'zustand'
import type { AmbienceSound, Settings } from '../../../../shared/types'
import { AMBIENCE, clampMasterDb, clampSoundDb, cleanSounds } from '../../audio/ambience'
import { DEFAULT_SETTINGS } from '../settings/settings.store'

/** Ambience layer settings. Saved through useSettings (bind.ts mirrors them), so they persist with the library.
 *  Chosen sounds are remembered by path relative to the library root ('Sound bites/Rain.wav'). */
type A = {
  on: boolean; level: number; sounds: AmbienceSound[]
  setOn(on: boolean): void
  setLevel(db: number): void
  toggleSound(rel: string): void
  setSoundLevel(rel: string, db: number): void
  hydrate(s?: Partial<Settings>): void
}
export const useAmbience = create<A>((set, get) => ({
  on: DEFAULT_SETTINGS.ambienceOn, level: DEFAULT_SETTINGS.ambienceLevel, sounds: DEFAULT_SETTINGS.ambienceSounds,
  setOn: (on) => set({ on }),
  setLevel: (db) => set({ level: clampMasterDb(db) }),
  toggleSound: (rel) => { const s = get().sounds; set({ sounds: s.some((x) => x.rel === rel) ? s.filter((x) => x.rel !== rel) : [...s, { rel, level: AMBIENCE.soundDefaultDb }] }) },
  setSoundLevel: (rel, db) => set({ sounds: get().sounds.map((x) => (x.rel === rel ? { ...x, level: clampSoundDb(db) } : x)) }),
  hydrate: (s) => set({ on: s?.ambienceOn === true, level: clampMasterDb(typeof s?.ambienceLevel === 'number' ? s.ambienceLevel : DEFAULT_SETTINGS.ambienceLevel), sounds: cleanSounds(s?.ambienceSounds) })
}))
export const ambienceSettingsOf = (a: Pick<A, 'on' | 'level' | 'sounds'>): Pick<Settings, 'ambienceOn' | 'ambienceLevel' | 'ambienceSounds'> => ({ ambienceOn: a.on, ambienceLevel: a.level, ambienceSounds: a.sounds })

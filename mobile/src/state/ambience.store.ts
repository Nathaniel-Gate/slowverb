import { AMBIENCE, clampMasterDb, clampSoundDb, cleanSounds } from '@app/audio/ambience'
import type { AmbienceSound } from '@shared/types'
import { create } from 'zustand'
import { CONFIG } from '../config'

/** The phone's LAYERS: extra tracks played together with the music, in step with its play / pause (same model as the Mac's ambience store).
 *  A layer = a song of the phone library, remembered by its path ('White noise/Rain.m4a'); its own level, LOOP, and a queue of more tracks. Saved in localStorage. */
type A = {
  on: boolean; level: number; sounds: AmbienceSound[]
  setOn(on: boolean): void
  setLevel(db: number): void
  toggleSound(rel: string): void
  setSoundLevel(rel: string, db: number): void
  setLoop(rel: string, loop: boolean): void
  queueAdd(rel: string, rels: string[]): void
  queueRemove(rel: string, index: number): void
  addSounds(rels: string[]): void   // add layers (no-op for ones already chosen) and switch the layers on
}
const DEFAULT_LEVEL = -20
const read = (): Pick<A, 'on' | 'level' | 'sounds'> => {
  try {
    const v = JSON.parse(localStorage.getItem(CONFIG.keys.ambience) ?? '{}')
    return { on: v.on === true, level: clampMasterDb(typeof v.level === 'number' ? v.level : DEFAULT_LEVEL), sounds: cleanSounds(v.sounds) }
  } catch { return { on: false, level: DEFAULT_LEVEL, sounds: [] } }
}
export const useAmbience = create<A>((set, get) => ({
  ...read(),
  setOn: (on) => set({ on }),
  setLevel: (db) => set({ level: clampMasterDb(db) }),
  toggleSound: (rel) => { const s = get().sounds; set({ sounds: s.some((x) => x.rel === rel) ? s.filter((x) => x.rel !== rel) : [...s, { rel, level: AMBIENCE.soundDefaultDb }] }) },
  setSoundLevel: (rel, db) => set({ sounds: get().sounds.map((x) => (x.rel === rel ? { ...x, level: clampSoundDb(db) } : x)) }),
  setLoop: (rel, loop) => set({ sounds: get().sounds.map((x) => (x.rel === rel ? { ...x, loop } : x)) }),
  queueAdd: (rel, rels) => set({ sounds: get().sounds.map((x) => (x.rel === rel ? { ...x, queue: [...(x.queue ?? []), ...rels] } : x)) }),
  queueRemove: (rel, i) => set({ sounds: get().sounds.map((x) => (x.rel === rel ? { ...x, queue: (x.queue ?? []).filter((_, k) => k !== i) } : x)) }),
  addSounds: (rels) => { const s = get().sounds, add = rels.filter((r, i) => !s.some((x) => x.rel === r) && rels.indexOf(r) === i); set({ on: true, sounds: [...s, ...add.map((rel) => ({ rel, level: AMBIENCE.soundDefaultDb }))] }) }
}))
useAmbience.subscribe(({ on, level, sounds }) => { try { localStorage.setItem(CONFIG.keys.ambience, JSON.stringify({ on, level, sounds })) } catch { /* memory only */ } })

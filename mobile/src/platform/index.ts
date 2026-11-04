import { Capacitor } from '@capacitor/core'
import { createNativePlatform } from './native'
import type { Platform } from './types'
import { createWebPlatform } from './web'

let current: Platform | null = null
const pick = (): Platform => (Capacitor.isNativePlatform() ? createNativePlatform() : createWebPlatform())
const p = (): Platform => (current ??= pick())

/** Swap the backend (tests, dev seeding). */
export const setPlatform = (next: Platform | null) => { current = next }

/** The active platform, chosen lazily on first use (native on iPhone, IndexedDB in a browser). */
export const platform: Platform = {
  pickAudioFiles: () => p().pickAudioFiles(),
  putSong: (m, d) => p().putSong(m, d),
  listSongs: () => p().listSongs(),
  getSongUrl: (id) => p().getSongUrl(id),
  deleteSong: (id) => p().deleteSong(id),
  updateSong: (id, patch) => p().updateSong(id, patch),
  loadLists: () => p().loadLists(),
  saveLists: (l) => p().saveLists(l)
}
export type { PickedFile, Platform, Song } from './types'

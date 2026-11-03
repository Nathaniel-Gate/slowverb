// Types + constants shared by main, preload and renderer.
export const AUDIO_EXTS = ['mp3', 'm4a', 'wav', 'flac', 'ogg', 'aac', 'opus', 'aiff', 'webm']

export type Fx = {
  speed: number      // playback rate, 1 = original
  pitchLock: boolean // false = slower also means lower (the "slowed" sound)
  wet: number        // reverb mix 0..1
  decay: number      // reverb length, seconds
  damping: number    // 0..1, how dark the reverb tail is
}
export type Track = {
  id: string; path: string; title: string; artist: string; duration: number
  fx?: Fx // this track's remembered version
}
export type Saved = { tracks: Track[]; cur: string | null; fx: Fx; preset: string | null; userPresets: { name: string; fx: Fx }[] }
export type ScanResult = Omit<Track, 'id' | 'fx'>

/** Download progress sent main -> UI. pct null = unknown duration (show a moving bar, not a number). */
export type DlProgress = { stage: string; pct: number | null; item?: { i: number; n: number } }

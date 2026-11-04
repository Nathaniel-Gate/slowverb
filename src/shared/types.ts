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
/** One chosen Sound bite for the ambience layer: its path relative to the library root ('Sound bites/Rain.wav') and its own level in dB. */
export type AmbienceSound = { rel: string; level: number; loop?: boolean; queue?: string[] }   // queue = more tracks played after `rel`, in order   // loop unset = loops for Sound bites, plays once for songs
export type Settings = {
  playOnClick: boolean; playAfterAdd: boolean; autoAdvance: boolean; gapSec: number
  ambienceOn: boolean; ambienceLevel: number; ambienceSounds: AmbienceSound[] // looped Sound bites under the music: switch, master level (dB), chosen sounds
}
export type Saved = { tracks: Track[]; cur: string | null; fx: Fx; preset: string | null; userPresets: { name: string; fx: Fx }[]; settings?: Partial<Settings> }
export type ScanResult = Omit<Track, 'id' | 'fx'>

/** Download progress sent main -> UI. pct null = unknown duration (show a moving bar, not a number). */
export type DlProgress = { stage: string; pct: number | null; item?: { i: number; n: number } }

/** A virtual playlist: an ordered list of songs by path relative to the library root. A song can be in many; deleting a playlist never touches files. */
export type Playlist = { id: string; name: string; created: number; songs: string[]; category?: string }   // category = which home it belongs to (Songs / Sound bites / White noise); unset = worked out from its songs

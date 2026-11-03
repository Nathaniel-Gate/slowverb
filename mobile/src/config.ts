// Tunables for the phone app logic (platform, player, engine). Change a number here, the logic follows.
export const CONFIG = {
  skipSeconds: 15,            // lock-screen / UI skip step
  fxSaveDebounceMs: 400,      // wait this long after the last slider move before saving the song's version
  posSaveMs: 2000,            // how often playback position is persisted while playing
  resumeMinSec: 3,            // only resume a song if it was left at least this far in
  resumeEndGuardSec: 5,       // ...and more than this far from the end
  tagTimeoutMs: 8000,         // give up reading a file's duration after this long
  audioAccept: 'audio/*,.mp3,.m4a,.aac,.wav,.flac,.ogg,.opus,.aiff,.caf',
  nativeSongsDir: 'songs',    // Documents/songs/<id>.<ext>
  nativeMetaFile: 'songs/library.json',
  nativeChunkBytes: 3 * 1024 * 1024, // multiple of 3 so each base64 chunk joins cleanly
  db: { name: 'slowverb', version: 1, songs: 'songs', blobs: 'blobs' },
  keys: { positions: 'slowverb.positions', settings: 'slowverb.settings' },
  defaultSettings: { autoAdvance: true, playOnTap: true }
} as const

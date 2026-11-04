import { basename, join } from 'path'
import { phoneCategory } from '../shared/phoneModel'
import { safeName } from './editorPaths'

// Pure helpers for "Send to phone" (no electron import so they are unit-testable).

/** `Helium (0.80x reverb).m4a`-style name: safe on every file system, never empty. */
export const phoneFileName = (title: string) => `${safeName(title).slice(0, 120) || 'Song'}.m4a`

/** Where a phone copy goes: <phoneRoot>/<Category>/<name>.m4a. `rel` = the song's folder in the library; its category folder is used
 *  (Songs by default), sub-folders are not copied: the phone organises with playlists instead. */
export const phoneDest = (phoneRoot: string, rel: string, title: string) => join(phoneRoot, phoneCategory(rel), phoneFileName(title))

/** macOS built-in converter: WAV -> AAC in an .m4a container. */
export const afconvertArgs = (wavIn: string, m4aOut: string, kbps = 256) => ['-f', 'm4af', '-d', 'aac', '-b', String(kbps * 1000), wavIn, m4aOut]

export const tempWavName = (title: string) => `slowverb-phone-${Date.now()}-${basename(safeName(title)).slice(0, 40) || 'song'}.wav`

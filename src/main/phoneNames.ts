import { basename, join } from 'path'
import { safeName } from './editorPaths'

// Pure helpers for "Send to phone" (no electron import so they are unit-testable).

/** `Helium (0.80x reverb).m4a`-style name: safe on every file system, never empty. */
export const phoneFileName = (title: string) => `${safeName(title).slice(0, 120) || 'Song'}.m4a`

/** Sub-folder inside the phone folder for a playlist (relative folder under the library root; '' = loose songs). */
export const phoneSubdir = (rel: string) => rel.split('/').filter(Boolean).map((p) => safeName(p)).filter(Boolean).join('/')

/** Where a phone copy goes: <phoneRoot>/<playlist folders>/<name>.m4a */
export const phoneDest = (phoneRoot: string, rel: string, title: string) => join(phoneRoot, ...phoneSubdir(rel).split('/').filter(Boolean), phoneFileName(title))

/** macOS built-in converter: WAV -> AAC in an .m4a container. */
export const afconvertArgs = (wavIn: string, m4aOut: string, kbps = 256) => ['-f', 'm4af', '-d', 'aac', '-b', String(kbps * 1000), wavIn, m4aOut]

export const tempWavName = (title: string) => `slowverb-phone-${Date.now()}-${basename(safeName(title)).slice(0, 40) || 'song'}.wav`

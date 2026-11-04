import { CATEGORIES, DEFAULT_CATEGORY } from './config'
import type { Playlist } from './types'

// Pure rules for the phone copy of the library, shared by the Mac app (writes it) and the phone app (reads it).
// Layout inside iCloud Drive > Slowverb Phone:  Songs/  Sound bites/  White noise/  (flat, one file each)  +  playlists.json
// playlists.json = { version: 1, playlists: [{ id, name, created, category, songs: ['Songs/a.m4a', ...] }], files: ['Songs/a.m4a', ...] }
//   songs are paths relative to the Slowverb Phone folder; `files` lists every file ever sent, so the phone can tell a file's category by its name.

export type PhoneManifest = { version: 1; playlists: Playlist[]; files: string[] }
/** The bits of a Mac playlist the phone copy needs (the song list is rebuilt from what was actually sent). */
export type ListRef = { id: string; name: string; created: number; category?: string }

const isCategory = (c: unknown): c is string => typeof c === 'string' && (CATEGORIES as readonly string[]).includes(c)
const dedupe = (a: string[]) => [...new Set(a)]
export const baseName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)

/** The category folder a send goes to: the first folder of the song's library path if it is a category, else Songs. */
export const phoneCategory = (folderRel: string): string => {
  const seg = folderRel.split('/').filter(Boolean)[0]
  return isCategory(seg) ? seg : DEFAULT_CATEGORY
}
export const phoneRel = (category: string, fileName: string) => `${category}/${fileName}`

export const emptyManifest = (): PhoneManifest => ({ version: 1, playlists: [], files: [] })

/** Anything read from disk -> a clean manifest. Odd entries are dropped; never throws. */
export function cleanManifest(v: unknown): PhoneManifest {
  const o = (v && typeof v === 'object' ? v : {}) as { playlists?: unknown; files?: unknown }
  const strs = (a: unknown) => (Array.isArray(a) ? a.filter((s): s is string => typeof s === 'string' && s.length > 0) : [])
  const seen = new Set<string>(), playlists: Playlist[] = []
  for (const p of Array.isArray(o.playlists) ? o.playlists : []) {
    if (!p || typeof p.id !== 'string' || !p.id || seen.has(p.id) || typeof p.name !== 'string' || !p.name.trim()) continue
    seen.add(p.id)
    playlists.push({ id: p.id, name: p.name.trim(), created: Number.isFinite(p.created) ? p.created : 0, songs: dedupe(strs(p.songs)), ...(isCategory(p.category) ? { category: p.category } : {}) })
  }
  return { version: 1, playlists, files: dedupe(strs(o.files)) }
}
export function parseManifest(text: string): PhoneManifest {
  try { return cleanManifest(JSON.parse(text)) } catch { return emptyManifest() }
}

/** Record one sent file: it joins `files`, and every playlist it was in (matched by id; new ones are created) gains it. Existing entries are kept. */
export function recordSent(m: PhoneManifest, rel: string, lists: ListRef[]): PhoneManifest {
  const playlists = m.playlists.map((p) => ({ ...p, songs: [...p.songs] }))
  for (const l of lists) {
    const cat = isCategory(l.category) ? l.category : undefined, at = playlists.find((p) => p.id === l.id)
    if (at) { at.name = l.name; if (cat) at.category = cat; at.songs = dedupe([...at.songs, rel]) }
    else playlists.push({ id: l.id, name: l.name, created: l.created, songs: [rel], ...(cat ? { category: cat } : {}) })
  }
  return { version: 1, playlists, files: dedupe([...m.files, rel]) }
}

/** The category a named file was sent to, according to a manifest (null when it is not mentioned). Playlists count too. */
export function categoryByName(m: PhoneManifest, fileName: string): string | null {
  const hit = [...m.files, ...m.playlists.flatMap((p) => p.songs)].find((r) => baseName(r) === fileName)
  const seg = hit?.split('/')[0]
  return hit && hit.includes('/') && isCategory(seg) ? seg : null
}

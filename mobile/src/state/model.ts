import { CATEGORIES, DEFAULT_CATEGORY } from '@shared/config'
import { listCategory } from '@shared/libraryModel'
import { categoryByName, type PhoneManifest } from '@shared/phoneModel'
import type { Playlist } from '@shared/types'
import type { Song } from '../platform/types'

// Pure rules for the phone library: categories, song paths, playlists. Same shapes as the Mac app so playlists.json lines up.

export const isCategory = (c: unknown): c is string => typeof c === 'string' && (CATEGORIES as readonly string[]).includes(c)
/** A song's home. Songs imported before categories existed have none: they are Songs. */
export const catOf = (s: Pick<Song, 'category'>): string => (isCategory(s.category) ? s.category : DEFAULT_CATEGORY)
/** The song's path in the library ('Songs/a.m4a'): what playlists and layers remember it by. Legacy songs with no file name use their id. */
export const songRel = (s: Pick<Song, 'id' | 'category' | 'file'>): string => `${catOf(s)}/${s.file ?? s.id}`
export const inCategory = (songs: Song[], cat: string): Song[] => songs.filter((s) => catOf(s) === cat)
export const listsIn = (lists: Playlist[], cat: string): Playlist[] => lists.filter((l) => listCategory(l, CATEGORIES, DEFAULT_CATEGORY) === cat)
export const catOfList = (l: Playlist): string => listCategory(l, CATEGORIES, DEFAULT_CATEGORY)

/** The songs of a playlist, in the playlist's order. References to songs that are not on the phone (yet) are skipped. */
export function songsOfList(songs: Song[], l: Playlist): Song[] {
  const by = new Map(songs.map((s) => [songRel(s), s]))
  return l.songs.flatMap((r) => { const s = by.get(r); return s ? [s] : [] })
}
export const countInList = (songs: Song[], l: Playlist): number => songsOfList(songs, l).length

/** A file name that is free inside the category ("a.m4a" -> "a (1).m4a"), given every song already on the phone. */
export function uniqueFile(songs: Song[], cat: string, name: string): string {
  const taken = new Set(inCategory(songs, cat).map((s) => s.file ?? s.id))
  if (!taken.has(name)) return name
  const dot = name.lastIndexOf('.'), at = dot > 0 ? dot : name.length
  for (let n = 1; ; n++) { const c = `${name.slice(0, at)} (${n})${name.slice(at)}`; if (!taken.has(c)) return c }
}

/** Where an imported file lands: the category the Mac recorded for that file name, else the tab the user is on. */
export const categoryForImport = (name: string, manifest: PhoneManifest | null, fallback: string): string =>
  (manifest && categoryByName(manifest, name)) || (isCategory(fallback) ? fallback : DEFAULT_CATEGORY)

/** Bring playlists from the Mac (playlists.json) into the phone's: matched by id, songs are added (never removed), the phone's own name wins. New ones are appended. */
export function mergeLists(mine: Playlist[], incoming: Playlist[]): Playlist[] {
  const out = mine.map((l) => ({ ...l, songs: [...l.songs] }))
  for (const p of incoming) {
    const at = out.find((l) => l.id === p.id)
    if (at) at.songs = [...new Set([...at.songs, ...p.songs])]
    else out.push({ ...p, songs: [...p.songs] })
  }
  return out
}

/** Is the picked file the playlists manifest (not audio)? */
export const isManifestFile = (name: string) => /\.json$/i.test(name)

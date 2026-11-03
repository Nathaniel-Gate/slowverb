import { CATEGORIES, DEFAULT_CATEGORY } from './config'
import type { Playlist } from './types'

// Pure rules for the library: where a file lives (its category), the one-time migration plan, and playlist reference upkeep.
// No electron / DOM imports, so main and renderer share it and it tests on its own.

export type Move = { from: string; to: string }                       // paths relative to the library root
export type MigrationPlan = { moves: Move[]; lists: { name: string; songs: string[] }[] }   // lists[].songs = NEW rel paths

/** The category folder a file lives in ('Songs' | 'Sound bites'), or null when it sits outside every category. */
export const categoryOf = (rel: string): string | null => {
  const i = rel.indexOf('/'); if (i < 0) return null
  const seg = rel.slice(0, i); return (CATEGORIES as readonly string[]).includes(seg) ? seg : null
}
const baseName = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)
const dedupe = (a: string[]) => [...new Set(a)]

function uniqueRel(rel: string, taken: Set<string>): string {
  if (!taken.has(rel)) return rel
  const slash = rel.lastIndexOf('/') + 1, dot = rel.lastIndexOf('.'), at = dot > slash ? dot : rel.length
  for (let n = 1; ; n++) { const c = `${rel.slice(0, at)} (${n})${rel.slice(at)}`; if (!taken.has(c)) return c }
}

/** One-time move into the new layout. Files already in a category stay. Loose root files -> Songs/. A file in an old folder-playlist
 *  `X/...` -> Songs/X/..., and X becomes a virtual playlist holding it. Never overwrites: names that collide get " (n)". */
export function planMigration(files: string[]): MigrationPlan {
  const taken = new Set(files), moves: Move[] = [], byList = new Map<string, string[]>()
  for (const f of files) {
    if (categoryOf(f)) continue
    const to = uniqueRel(`${DEFAULT_CATEGORY}/${f}`, taken); taken.add(to); moves.push({ from: f, to })
    const top = f.includes('/') ? f.slice(0, f.indexOf('/')) : null
    if (top) byList.set(top, [...(byList.get(top) ?? []), to])
  }
  return { moves, lists: [...byList].map(([name, songs]) => ({ name, songs })) }
}

export const makeList = (id: string, name: string, created: number): Playlist => ({ id, name, created, songs: [] })
export const addSongs = (l: Playlist, rels: string[]): Playlist => ({ ...l, songs: dedupe([...l.songs, ...rels]) })
export const removeSong = (l: Playlist, rel: string): Playlist => ({ ...l, songs: l.songs.filter((s) => s !== rel) })
/** A file moved/renamed by the app: every playlist that pointed at `from` now points at `to`. */
export const rewriteRef = (lists: Playlist[], from: string, to: string): Playlist[] =>
  lists.map((l) => (l.songs.includes(from) ? { ...l, songs: dedupe(l.songs.map((s) => (s === from ? to : s))) } : l))

/** Keep references true to what is on disk. A missing reference is re-pointed at the file with the same name if exactly one exists
 *  (moved outside the app), otherwise dropped. Returns the same array when nothing changed so callers can skip saving. */
export function healLists(lists: Playlist[], existing: string[]): { lists: Playlist[]; dropped: string[]; repointed: number } {
  const have = new Set(existing), byName = new Map<string, string[]>()
  for (const r of existing) byName.set(baseName(r), [...(byName.get(baseName(r)) ?? []), r])
  const dropped: string[] = []; let repointed = 0, changed = false
  const out = lists.map((l) => {
    if (l.songs.every((s) => have.has(s))) return l
    changed = true
    const songs = dedupe(l.songs.flatMap((s) => {
      if (have.has(s)) return [s]
      const c = byName.get(baseName(s)) ?? []
      if (c.length === 1) { repointed++; return [c[0]] }
      dropped.push(s); return []
    }))
    return { ...l, songs }
  })
  return { lists: changed ? out : lists, dropped, repointed }
}

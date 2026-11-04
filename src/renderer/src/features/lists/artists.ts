import { MISC_ARTIST } from '../../../../shared/config'
import type { Track } from '../../../../shared/types'

/** Distinct artists in the library with song counts (case-insensitive), real artists A-Z; songs with no artist count under Misc. */
export function artistCounts(tracks: Track[]): { name: string; n: number }[] {
  const m = new Map<string, { name: string; n: number }>()
  for (const t of tracks) {
    const name = t.artist.trim() || MISC_ARTIST, k = name.toLowerCase(), e = m.get(k)
    if (e) e.n++; else m.set(k, { name, n: 1 })
  }
  return [...m.values()].sort((a, b) => (a.name === MISC_ARTIST ? 1 : b.name === MISC_ARTIST ? -1 : a.name.localeCompare(b.name)))
}

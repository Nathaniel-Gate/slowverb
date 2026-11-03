import { categoryOf } from '../../../../shared/libraryModel'
import type { Track } from '../../../../shared/types'
import { AMBIENCE } from '../../audio/ambience'
import { fileRel } from '../playlists/playlists.store'

export type SoundBite = { rel: string; path: string }

/** Every library file whose home is the Sound bites category (any sub-folder), sorted by path. */
export function soundBites(tracks: Track[], root: string): SoundBite[] {
  const out: SoundBite[] = []
  for (const t of tracks) { const rel = fileRel(root, t.path); if (rel && categoryOf(rel) === AMBIENCE.category) out.push({ rel, path: t.path }) }
  return out.sort((a, b) => a.rel.localeCompare(b.rel))
}

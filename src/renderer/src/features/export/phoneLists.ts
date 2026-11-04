import type { ListRef } from '../../../../shared/phoneModel'
import { catOfList, useLists } from '../lists/lists.store'
import { fileRel, usePlaylists } from '../playlists/playlists.store'

/** The playlists a song (by file path) is in, as the phone copy needs them: only these are written to Slowverb Phone/playlists.json. */
export function phoneListsFor(songPath: string | undefined): ListRef[] {
  const rel = songPath ? fileRel(usePlaylists.getState().root, songPath) : null
  return useLists.getState().lists.filter((l) => rel && l.songs.includes(rel)).map((l) => ({ id: l.id, name: l.name, created: l.created, category: catOfList(l) }))
}

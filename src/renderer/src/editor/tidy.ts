import type { Project } from './model'
import { removeTrack } from './ops'

/** "Auto-delete empty tracks": after an edit, a track that HAD clips and now has none is removed (same undo step as the edit, so
 *  Cmd+Z brings it back). Tracks you just made empty on purpose (new, never had clips) are left alone, locked tracks are kept,
 *  and the last track is never removed. Off unless Project.autoDeleteEmpty is true. */
export function tidyTracks(before: Project, after: Project): Project {
  if (!after.autoDeleteEmpty) return after
  const had = new Set(before.clips.map((c) => c.track)), has = new Set(after.clips.map((c) => c.track))
  let out = after
  for (const t of after.tracks) if (had.has(t.id) && !has.has(t.id) && !t.lock && out.tracks.length > 1) out = removeTrack(out, t.id)
  return out
}
/** Remove every empty, unlocked track now (used when the option is switched on). Keeps at least one track. */
export function sweepEmptyTracks(p: Project): Project {
  const has = new Set(p.clips.map((c) => c.track))
  let out = p
  for (const t of p.tracks) if (!has.has(t.id) && !t.lock && out.tracks.length > 1) out = removeTrack(out, t.id)
  return out
}

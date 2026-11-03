import { clipDur, clipEnd, MIN_CLIP, type Project } from './model'
import { finite } from './clipmath'

const SLACK = 1e-6

/** List of invariant violations (empty = valid). Used by tests and as a dev-time assertion. */
export function validate(p: Project): string[] {
  const bad: string[] = []
  const dupes = (what: string, ids: string[]) => {
    const seen = new Set<string>()
    for (const id of ids) { if (seen.has(id)) bad.push(`duplicate ${what} id ${id}`); seen.add(id) }
  }
  dupes('clip', p.clips.map(c => c.id)); dupes('track', p.tracks.map(t => t.id)); dupes('marker', p.markers.map(m => m.id))
  const tracks = new Set(p.tracks.map(t => t.id))
  for (const t of p.tracks) if (!finite(t.gain) || t.gain < 0) bad.push(`track ${t.id} bad gain`)
  for (const m of p.markers) if (!finite(m.t) || m.t < 0) bad.push(`marker ${m.id} bad time`)
  for (const c of p.clips) {
    const nums = [c.start, c.srcIn, c.srcOut, c.gain, c.fadeIn, c.fadeOut]
    if (!nums.every(finite)) { bad.push(`clip ${c.id} has non-finite number`); continue }
    if (!tracks.has(c.track)) bad.push(`clip ${c.id} on missing track ${c.track}`)
    const src = p.sources[c.src]
    if (!src) bad.push(`clip ${c.id} has unknown source`)
    else if (c.srcOut > src.duration + SLACK) bad.push(`clip ${c.id} srcOut ${c.srcOut} past source ${src.duration}`)
    if (c.srcIn < -SLACK) bad.push(`clip ${c.id} srcIn < 0`)
    if (c.start < -SLACK) bad.push(`clip ${c.id} start < 0`)
    if (clipDur(c) < MIN_CLIP - SLACK) bad.push(`clip ${c.id} shorter than MIN_CLIP`)
    if (c.gain < 0) bad.push(`clip ${c.id} negative gain`)
    if (c.fadeIn < -SLACK || c.fadeOut < -SLACK || c.fadeIn + c.fadeOut > clipDur(c) + SLACK) bad.push(`clip ${c.id} fades exceed duration`)
  }
  for (const t of p.tracks) {
    const on = p.clips.filter(c => c.track === t.id && finite(c.start) && finite(c.srcIn) && finite(c.srcOut)).sort((a, b) => a.start - b.start)
    for (let i = 1; i < on.length; i++) {
      if (on[i].start < clipEnd(on[i - 1]) - SLACK) bad.push(`clips ${on[i - 1].id} and ${on[i].id} overlap on ${t.id}`)
    }
  }
  return bad
}

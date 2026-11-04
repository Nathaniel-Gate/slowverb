import { clipDur, clipEnd, srcSpan, MIN_CLIP, type Project } from './model'
import { FADE_CURVES, SLACK, SPEED_MAX, SPEED_MIN, finite, firstBadOverlap } from './clipmath'
import { validateLoops } from './validateLoops'

/**
 * List of invariant violations (empty = valid). Used by tests and as a dev-time assertion. Same-track overlap is legal
 * only as an explicit crossfade (overlap <= min(earlier.fadeOut, later.fadeIn), one neighbour at a time). Speed aware.
 */
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
  const okClips = p.clips.filter(c => {
    const nums = [c.start, c.srcIn, c.srcOut, c.gain, c.fadeIn, c.fadeOut]
    if (!nums.every(finite)) { bad.push(`clip ${c.id} has non-finite number`); return false }
    if (c.speed !== undefined && (!finite(c.speed) || c.speed < SPEED_MIN - SLACK || c.speed > SPEED_MAX + SLACK)) {
      bad.push(`clip ${c.id} speed ${c.speed} out of range`); return false
    }
    if (!tracks.has(c.track)) bad.push(`clip ${c.id} on missing track ${c.track}`)
    const src = p.sources[c.src], tr = p.tracks.find(t => t.id === c.track)
    if (src && tr && !!src.kind !== (tr.kind === 'visual')) bad.push(`clip ${c.id} ${src.kind ? 'picture on an audio' : 'audio on a visual'} track`)
    if (c.zoom !== undefined && (!finite(c.zoom) || c.zoom < 0)) bad.push(`clip ${c.id} bad zoom`)
    if (!src) bad.push(`clip ${c.id} has unknown source`)
    else if (c.srcOut > src.duration + SLACK) bad.push(`clip ${c.id} srcOut ${c.srcOut} past source ${src.duration}`)
    if (c.srcIn < -SLACK) bad.push(`clip ${c.id} srcIn < 0`)
    if (c.start < -SLACK) bad.push(`clip ${c.id} start < 0`)
    if (clipDur(c) < MIN_CLIP - SLACK || srcSpan(c) < MIN_CLIP - SLACK) bad.push(`clip ${c.id} shorter than MIN_CLIP`)
    if (c.gain < 0) bad.push(`clip ${c.id} negative gain`)
    if (c.fadeIn < -SLACK || c.fadeOut < -SLACK || c.fadeIn + c.fadeOut > clipDur(c) + SLACK) bad.push(`clip ${c.id} fades exceed duration`)
    for (const k of ['fadeInCurve', 'fadeOutCurve'] as const) if (c[k] !== undefined && !FADE_CURVES.includes(c[k]!)) bad.push(`clip ${c.id} unknown ${k} ${c[k]}`)
    if (c.env !== undefined) {
      const d = clipDur(c), env = c.env
      if (!Array.isArray(env)) bad.push(`clip ${c.id} envelope is not a list`)
      else env.forEach((x, i) => {
        if (!x || !finite(x.t) || !finite(x.g)) bad.push(`clip ${c.id} envelope point ${i} non-finite`)
        else if (x.g < 0) bad.push(`clip ${c.id} envelope point ${i} negative gain`)
        else if (x.t < -SLACK || x.t > d + SLACK) bad.push(`clip ${c.id} envelope point ${i} outside clip`)
        else if (i > 0 && x.t < env[i - 1].t - SLACK) bad.push(`clip ${c.id} envelope not sorted at ${i}`)
      })
    }
    return true
  })
  for (const t of p.tracks) {
    const on = okClips.filter(c => c.track === t.id).sort((a, b) => a.start - b.start || clipEnd(a) - clipEnd(b))
    const hit = firstBadOverlap(on)
    if (hit) bad.push(`clips ${on[hit[0]].id} and ${on[hit[1]].id} overlap on ${t.id}`)
  }
  return [...bad, ...validateLoops(p)]
}

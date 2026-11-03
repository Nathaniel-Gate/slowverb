import type { Project } from './model'
import { SLACK, finite } from './clipmath'
import { LOOP_MAX, LOOP_MIN_LEN, loopLen } from './opsLoop'

/** Loop invariants (wave 4): sane Loop numbers, every Clip.loop points at an existing Loop on the same track, no empty Loop. */
export function validateLoops(p: Project): string[] {
  const bad: string[] = [], loops = p.loops ?? [], byId = new Map(loops.map(l => [l.id, l]))
  if (p.loops !== undefined && !Array.isArray(p.loops)) return ['loops is not a list']
  if (byId.size !== loops.length) bad.push('duplicate loop id')
  const tracks = new Set(p.tracks.map(t => t.id))
  for (const l of loops) {
    const nums = [l.srcIn, l.srcOut, l.start, l.count, l.xfade, l.gain]
    if (!nums.every(finite)) { bad.push(`loop ${l.id} has non-finite number`); continue }
    if (!tracks.has(l.track)) bad.push(`loop ${l.id} on missing track ${l.track}`)
    const src = p.sources[l.src]
    if (!src) bad.push(`loop ${l.id} has unknown source`)
    else if (l.srcOut > src.duration + SLACK) bad.push(`loop ${l.id} srcOut past source`)
    if (l.srcIn < -SLACK) bad.push(`loop ${l.id} srcIn < 0`)
    if (loopLen(l) < LOOP_MIN_LEN - SLACK) bad.push(`loop ${l.id} shorter than LOOP_MIN_LEN`)
    if (!Number.isInteger(l.count) || l.count < 1 || l.count > LOOP_MAX) bad.push(`loop ${l.id} bad count ${l.count}`)
    if (l.xfade < -SLACK || l.xfade > loopLen(l) / 2 + SLACK) bad.push(`loop ${l.id} bad crossfade ${l.xfade}`)
    if (l.start < -SLACK) bad.push(`loop ${l.id} start < 0`)
    if (l.gain < 0) bad.push(`loop ${l.id} negative gain`)
    if (!p.clips.some(c => c.loop === l.id)) bad.push(`loop ${l.id} has no clips`)
  }
  for (const c of p.clips) {
    if (c.loop === undefined) continue
    const l = byId.get(c.loop)
    if (!l) bad.push(`clip ${c.id} refers to missing loop ${c.loop}`)
    else if (l.track !== c.track) bad.push(`clip ${c.id} is not on its loop's track`)
  }
  return bad
}

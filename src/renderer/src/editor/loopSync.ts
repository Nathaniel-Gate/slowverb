import type { Clip, EnvPoint, Loop, Project } from './model'

// Keeps live loops consistent after ANY op (wave 4, agent E3). A repeat clip that an op changed (split, trim, gain,
// speed, a move of only some members...) is detached (its Clip.loop removed); a Loop with no member left is dropped.
// When every member moved by the same dt and/or to the same track (and nothing else changed), the loop stays live and
// Loop.start / Loop.track follow. Copies that carry a loop id (duplicate, paste, split right halves) are detached.

const MOVE_EPS = 1e-9   // members count as moved "together" when their start deltas agree to within this

export const stripLoop = (c: Clip): Clip => {
  if (!('loop' in c)) return c
  const { loop: _gone, ...rest } = c
  return rest
}

const sameEnv = (a: unknown, b: unknown) => {
  const x = a as EnvPoint[] | undefined, y = b as EnvPoint[] | undefined
  return Array.isArray(x) && Array.isArray(y) && x.length === y.length && x.every((pt, i) => pt.t === y[i].t && pt.g === y[i].g)
}

const MOVE_KEYS = new Set(['start', 'track']), NO_KEYS = new Set<string>()
function sameExcept(a: Clip, b: Clip, skip: Set<string>): boolean {
  const ra = a as Record<string, unknown>, rb = b as Record<string, unknown>
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (skip.has(k) || ra[k] === rb[k] || (k === 'env' && sameEnv(ra[k], rb[k]))) continue
    return false
  }
  return true
}

const groupBy = (clips: Clip[]) => {
  const m = new Map<string, Clip[]>()
  for (const c of clips) if (c.loop !== undefined) m.set(c.loop, [...(m.get(c.loop) ?? []), c])
  return m
}

/** l itself (untouched), a moved copy of l (all members moved together), or null (something else changed). */
function liveMove(l: Loop, was: Clip[], now: Clip[]): Loop | null {
  if (!was.length || was.length !== now.length) return null
  const old = new Map(was.map(c => [c.id, c]))
  let d: number | null = null
  for (const c of now) {
    const b = old.get(c.id)
    if (!b || !sameExcept(b, c, MOVE_KEYS) || c.track !== now[0].track) return null
    const di = c.start - b.start
    if (d === null) d = di
    else if (Math.abs(di - d) > MOVE_EPS) return null
  }
  if (d === 0 && now[0].track === l.track) return l
  return { ...l, start: Math.max(0, l.start + (d ?? 0)), track: now[0].track }
}

/** q with `loops` set, or with the key removed when there are none. */
export function withLoops(q: Project, loops: Loop[]): Project {
  if (loops.length) return q.loops === loops ? q : { ...q, loops }
  if (!('loops' in q)) return q
  const { loops: _gone, ...rest } = q
  return rest
}

/**
 * Reconcile loops after an op turned p into q. `keep` = a loop the op itself regenerated (left as it is). Returns q
 * itself when nothing needed fixing, so no-op detection by identity keeps working.
 */
export function syncLoops(p: Project, q: Project, keep?: string): Project {
  if (q === p) return q
  const loops = q.loops ?? []
  if (!loops.length && !q.clips.some(c => c.loop !== undefined)) return 'loops' in q ? withLoops(q, []) : q
  const was = groupBy(p.clips), now = groupBy(q.clips), detach = new Set<string>()
  const next: Loop[] = []
  let changed = false
  for (const l of loops) {
    const members = now.get(l.id) ?? []
    if (l.id === keep) { if (members.length) next.push(l); else changed = true; continue }
    const moved = liveMove(l, was.get(l.id) ?? [], members)
    if (moved) { next.push(moved); if (moved !== l) changed = true; continue }
    const before = new Map((was.get(l.id) ?? []).map(c => [c.id, c]))
    let kept = 0
    for (const c of members) {
      const b = before.get(c.id)
      if (b && sameExcept(b, c, NO_KEYS)) kept++
      else detach.add(c.id)
    }
    if (kept) next.push(l); else changed = true
  }
  const live = new Set(next.map(l => l.id))
  for (const c of q.clips) if (c.loop !== undefined && !live.has(c.loop)) detach.add(c.id)
  if (!detach.size && !changed) return q
  const clips = detach.size ? q.clips.map(c => (detach.has(c.id) ? stripLoop(c) : c)) : q.clips
  return withLoops({ ...q, clips }, next)
}

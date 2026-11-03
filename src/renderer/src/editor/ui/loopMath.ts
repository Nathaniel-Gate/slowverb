import { clipEnd, type Clip, type Loop, type Project } from '../model'

// Pure helpers for how loops look and select on the timeline. The loop NUMBERS live in Project.loops; the repeats are ordinary clips
// carrying Clip.loop. Everything here reads the clips so it keeps working on a drag preview too.

export type Member = { loop: string; rep: number }

/** Repeat clips grouped by loop id, each group in start order. */
export function groupLoops(clips: Clip[]): Map<string, Clip[]> {
  const g = new Map<string, Clip[]>()
  for (const c of clips) if (c.loop) { const a = g.get(c.loop); if (a) a.push(c); else g.set(c.loop, [c]) }
  for (const a of g.values()) a.sort((x, y) => x.start - y.start)
  return g
}

/** Clip id -> which loop and which repeat it is. */
export function memberIndex(groups: Map<string, Clip[]>): Map<string, Member> {
  const m = new Map<string, Member>()
  for (const [loop, cs] of groups) cs.forEach((c, rep) => m.set(c.id, { loop, rep }))
  return m
}

/** The loop whose repeats are ALL selected (the first such), else null. Handles and the Inspector follow this one. */
export function selectedLoopId(p: Project, groups: Map<string, Clip[]>, selection: string[]): string | null {
  if (!p.loops?.length || !selection.length) return null
  const sel = new Set(selection)
  for (const l of p.loops) {
    const cs = groups.get(l.id)
    if (cs?.length && cs.every(c => sel.has(c.id))) return l.id
  }
  return null
}

/** Selecting any repeat selects the whole loop: the selection with every touched loop completed, or null when nothing needs adding. */
export function expandLoopSelection(groups: Map<string, Clip[]>, selection: string[]): string[] | null {
  if (!groups.size) return null
  const idx = memberIndex(groups), sel = new Set(selection), touched = new Set<string>()
  for (const id of selection) { const m = idx.get(id); if (m) touched.add(m.loop) }
  const add: string[] = []
  for (const l of touched) for (const c of groups.get(l)!) if (!sel.has(c.id)) add.push(c.id)
  return add.length ? [...selection, ...add] : null
}

export type LoopGeom = { first: Clip; second?: Clip; last: Clip; start: number; end: number; period: number; xfade: number; count: number }
/** Where the loop sits on the timeline, from its repeat clips. period = distance between repeat starts. */
export function loopGeom(cs: Clip[] | undefined): LoopGeom | null {
  if (!cs?.length) return null
  const first = cs[0], second = cs[1], last = cs[cs.length - 1]
  const period = second ? second.start - first.start : clipEnd(first) - first.start
  const xfade = second ? Math.max(0, clipEnd(first) - second.start) : 0
  return { first, second, last, start: first.start, end: cs.reduce((m, c) => Math.max(m, clipEnd(c)), 0), period, xfade, count: cs.length }
}

/** Badge text parts: "LOOP x6" and "40 ms". */
export const loopBadge = (l: Pick<Loop, 'count' | 'xfade'>) => ({ name: `LOOP x${l.count}`, fade: `${Math.round(l.xfade * 1000)} ms` })

export type LoopHandle = 'in' | 'out' | 'xfade' | 'count' | 'tail'
/** The Loop patch for dragging a handle `d` timeline seconds (to the right is positive) from the loop as it was. */
export function handlePatch(which: LoopHandle, l: Loop, d: number): Partial<Pick<Loop, 'srcIn' | 'srcOut' | 'count' | 'xfade' | 'tail'>> {
  const len = l.srcOut - l.srcIn
  switch (which) {
    case 'in': return { srcIn: l.srcIn + d }
    case 'out': return { srcOut: l.srcOut + d }
    case 'xfade': return { xfade: Math.max(0, l.xfade - d) }                         // the overlap grows as its left edge moves left
    case 'tail': return { tail: (l.tail ?? 0) + d }                                  // drag the loop's right end: lengthen / shorten only the LAST repeat
    case 'count': return { count: Math.max(1, l.count + Math.round(d / Math.max(1e-6, len - l.xfade))) }
  }
}

import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { validate } from './ops'
import type { Project } from './model'
import { A, B, mk, proj } from './testkit'

// Wave 4: seeded random sequences mixing loop ops with every older op. After each op: validate(p) empty (it includes the
// loop invariants), every Clip.loop names an existing Loop, every Loop has members, and the input is never mutated.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

function randomOp(p: Project, r: () => number): Project {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const ids = () => p.clips.filter(() => r() < 0.4).map(c => c.id)
  const t = () => (r() < 0.15 ? pick([0, 0.01, 10, 100, -3]) : r() * 24 - 1)
  const one = () => (p.clips.length ? pick(p.clips).id : 'none')
  const loop = () => (p.loops?.length ? pick(p.loops).id : 'none')
  const members = () => p.clips.filter(c => c.loop === loop()).map(c => c.id)
  const pair = () => {
    const c = p.clips.length ? pick(p.clips) : null
    const next = c && p.clips.filter(x => x.track === c.track && x.start > c.start).sort((a, b) => a.start - b.start)[0]
    return [c?.id ?? 'none', next?.id ?? one()]
  }
  switch (Math.floor(r() * 34)) {
    case 0: case 1: case 2: return ops.makeLoop(p, one(), pick([undefined, 1, 2, 3, 6, 0, 500]), pick([undefined, 0, 0.01, 0.2, 5, -1]))
    case 3: case 4: return ops.updateLoop(p, loop(), { [pick(['srcIn', 'srcOut', 'count', 'xfade', 'start', 'gain'] as const)]: r() * 12 - 1 })
    case 5: return ops.updateLoop(p, loop(), { count: pick([1, 2, 5, 300]), xfade: r(), srcIn: r() * 6, srcOut: r() * 11 })
    case 6: return ops.loopFill(p, loop(), t())
    case 7: return ops.unloop(p, loop())
    case 8: case 9: return ops.nudgeLoopPoint(p, loop(), pick(['in', 'out'] as const), pick([0.001, -0.001, 0.01, -0.01, 3, -3]))
    case 10: case 11: { const l = loop(); return ops.moveClips(p, p.clips.filter(c => c.loop === l).map(c => c.id), r() * 6 - 3, pick([0, 0, 1, -1])) }
    case 12: return ops.moveClips(p, members().filter(() => r() < 0.5), r() * 6 - 3, pick([0, 1]))
    case 13: return ops.splitAt(p, t(), r() < 0.5 ? undefined : ids())
    case 14: return ops.rippleDelete(p, ids(), pick([undefined, { syncLock: false }]))
    case 15: return ops.moveClips(p, ids(), r() * 8 - 4, pick([0, 0, 1, -1]))
    case 16: return ops.trimClip(p, one(), pick(['in', 'out'] as const), t())
    case 17: return ops.rippleTrim(p, one(), pick(['in', 'out'] as const), t())
    case 18: return ops.setClipSpeed(p, one(), pick([0.5, 1, 2, r() * 3]), r() < 0.5)
    case 19: { const [l, rr] = pair(); return ops.rollEdit(p, l, rr, t()) }
    case 20: { const [l, rr] = pair(); return ops.applyCrossfade(p, l, rr, pick([0.05, 0.5, 1])) }
    case 21: { const [l, rr] = pair(); return ops.removeCrossfade(p, l, rr) }
    case 22: return ops.duplicateClips(p, ids(), r() * 8 - 4)
    case 23: return ops.pasteClips(p, p.clips.filter(() => r() < 0.5), t(), r() < 0.5 ? undefined : pick(p.tracks).id)
    case 24: return ops.repeatClips(p, ids(), pick([1, 2]))
    case 25: return ops.extractRange(p, t(), t())
    case 26: return ops.liftRange(p, t(), t())
    case 27: return ops.setClip(p, one(), { gain: r() * 2, fadeIn: r(), fadeOut: r() })
    case 28: return ops.setEnvPoint(p, one(), r() * 2, r() * 2)
    case 29: return ops.muteRange(p, t(), t())
    case 30: return ops.extendEdit(p, t())
    case 31: return r() < 0.5 ? ops.addTrack(p) : ops.removeTrack(p, pick(p.tracks).id)
    case 32: return ops.insertClips(p, p.clips.filter(() => r() < 0.3), t())
    default: return ops.setTrack(p, pick(p.tracks).id, { lock: r() < 0.2 })
  }
}

const start = (): Project => proj([
  mk('a', 'T1', 0, 1, 3), mk('b', 'T1', 6, 0, 4, B, { fadeIn: 0.5 }), mk('c', 'T2', 2, 0, 8), mk('d', 'T3', 1, 2, 2.5, B),
])

function loopRefsOk(p: Project) {
  const loops = new Set((p.loops ?? []).map(l => l.id))
  for (const c of p.clips) if (c.loop !== undefined && !loops.has(c.loop)) return `clip ${c.id} -> missing loop ${c.loop}`
  for (const l of p.loops ?? []) if (!p.clips.some(c => c.loop === l.id)) return `loop ${l.id} has no clips`
  return null
}

describe('wave 4 loop fuzz', () => {
  for (const seed of [1, 5, 13, 42, 99, 777, 2026, 31337]) {
    it(`seed ${seed}: 400 random ops keep loops valid`, () => {
      const r = rng(seed)
      let p = start(), loopsSeen = 0
      for (let i = 0; i < 400; i++) {
        const before = JSON.stringify(p)
        const next = randomOp(p, r)
        expect(JSON.stringify(p), `op ${i} mutated its input`).toBe(before)
        const bad = validate(next), ref = loopRefsOk(next)
        if (bad.length || ref) throw new Error(`seed ${seed} op ${i}: ${[...bad, ref].filter(Boolean).join('; ')}`)
        loopsSeen += next.loops?.length ? 1 : 0
        p = next.clips.length && next.clips.length <= 80 ? next : start()
      }
      expect(loopsSeen).toBeGreaterThan(20)   // the sequence really exercised live loops
    })
  }
  it('a loop moved whole, regenerated and moved again stays exactly its expansion', () => {
    const r = rng(3)
    let p = ops.makeLoop(start(), 'a', 5, 0.3)
    for (let i = 0; i < 50; i++) {
      const l = p.loops![0]
      p = r() < 0.5 ? ops.moveClips(p, ops.loopClips(p, l.id).map(c => c.id), r() * 4 - 2, Math.floor(r() * 3) - 1)
        : ops.updateLoop(p, l.id, { count: 1 + Math.floor(r() * 8), xfade: r() * 0.5 })
      expect(validate(p)).toEqual([])
      const lo = p.loops![0], rs = ops.loopClips(p, lo.id)
      expect(rs).toHaveLength(lo.count)
      rs.forEach((c, k) => {
        expect(c.start).toBeCloseTo(lo.start + k * (ops.loopLen(lo) - lo.xfade), 9)
        expect(c.track).toBe(lo.track)
      })
    }
    expect(A).toBeTruthy()
  })
})

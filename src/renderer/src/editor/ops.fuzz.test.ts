import { describe, expect, it } from 'vitest'
import { createHistory, pushHistory, redo, undo } from './history'
import * as ops from './ops'
import { validate } from './ops'
import type { Clip, Project } from './model'
import { A, B, proj } from './testkit'

// Randomised op sequences: invariants must hold after EVERY op, and undo/redo must be exact.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

function randomOp(p: Project, r: () => number): Project {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const ids = () => p.clips.filter(() => r() < 0.4).map(c => c.id)
  const t = () => (r() < 0.2 ? pick([0, 0.01, 10, 100, -3]) : r() * 20 - 1)
  const dt = () => (r() < 0.2 ? pick([0, -100, 100, 0.005]) : r() * 8 - 4)
  const one = () => (p.clips.length ? pick(p.clips).id : 'none')
  switch (Math.floor(r() * 16)) {
    case 0: return ops.splitAt(p, t(), r() < 0.5 ? undefined : ids())
    case 1: return ops.deleteClips(p, ids())
    case 2: return ops.rippleDelete(p, ids())
    case 3: case 4: return ops.moveClips(p, ids(), dt(), pick([0, 0, 1, -1, 2]))
    case 5: return ops.trimClip(p, one(), pick(['in', 'out'] as const), t())
    case 6: return ops.rippleTrim(p, one(), pick(['in', 'out'] as const), t())
    case 7: return ops.duplicateClips(p, ids(), dt())
    case 8: {
      const src: Clip[] = p.clips.filter(() => r() < 0.5).map(c => ({ ...c, srcOut: c.srcOut + r() * 4 }))
      return ops.pasteClips(p, src, t(), r() < 0.5 ? undefined : pick(p.tracks).id)
    }
    case 9: return ops.setClip(p, one(), { gain: r() * 2, fadeIn: r() * 5, fadeOut: r() * 5 })
    case 10: return ops.setTrack(p, pick(p.tracks).id, { lock: r() < 0.25 })
    case 11: return r() < 0.5 ? ops.addTrack(p) : ops.removeTrack(p, pick(p.tracks).id)
    case 12: return ops.addMarker(p, t())
    case 13: return ops.splitAt(p, t())
    case 14: return ops.moveClips(p, [one()], dt())
    default: return ops.trimClip(p, one(), pick(['in', 'out'] as const), t())
  }
}

describe('random op sequences', () => {
  for (let seed = 1; seed <= 40; seed++) {
    it(`seed ${seed}: invariants hold after every op, undo/redo is exact`, () => {
      const r = rng(seed)
      let p = proj([{ id: 'a', src: A, track: 'T1', start: 0, srcIn: 0, srcOut: 10, gain: 1, fadeIn: 1, fadeOut: 1 }, { id: 'b', src: B, track: 'T2', start: 2, srcIn: 0, srcOut: 5, gain: 1, fadeIn: 0, fadeOut: 0 }])
      let h = createHistory(p)
      const snaps: string[] = [JSON.stringify(p)]
      for (let i = 0; i < 150; i++) {
        const before = JSON.stringify(p)
        const next = randomOp(p, r)
        expect(JSON.stringify(p), 'input mutated').toBe(before)
        const v = validate(next)
        expect(v, `step ${i}`).toEqual([])
        if (next !== p) { p = next; const nh = pushHistory(h, p); if (nh !== h) snaps.push(JSON.stringify(p)); h = nh }
      }
      const steps = h.past.length
      for (let i = 0; i < steps; i++) h = undo(h)
      expect(steps).toBe(snaps.length - 1); expect(steps).toBeGreaterThan(10)   // the sequence really changes things
      expect(JSON.stringify(h.present)).toBe(snaps[0])
      for (let i = 0; i < steps; i++) h = redo(h)
      expect(JSON.stringify(h.present)).toBe(JSON.stringify(p))
    })
  }
})

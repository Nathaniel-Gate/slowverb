import { describe, expect, it } from 'vitest'
import { createHistory, pushHistory, redo, undo } from './history'
import * as ops from './ops'
import { validate } from './ops'
import { clipEnd, type Clip, type Project } from './model'
import { A, B, proj } from './testkit'

// Wave 2: randomised sequences over EVERY op (old and new), with speed, crossfades, locked tracks and ripple with and
// without sync lock. validate(p) must be empty after every single op, inputs never mutate, undo/redo stays exact.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

function randomOp(p: Project, r: () => number): Project {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const ids = () => p.clips.filter(() => r() < 0.4).map(c => c.id)
  const t = () => (r() < 0.2 ? pick([0, 0.01, 10, 100, -3]) : r() * 24 - 1)
  const dt = () => (r() < 0.2 ? pick([0, -100, 100, 0.005]) : r() * 8 - 4)
  const one = () => (p.clips.length ? pick(p.clips).id : 'none')
  const tracks = () => (r() < 0.5 ? undefined : p.tracks.filter(() => r() < 0.5).map(x => x.id))
  const ropts = () => pick([undefined, { syncLock: false }, { syncLock: true }, { tracks: tracks() ?? [] }])
  const sorted = () => {   // a left/right pair on one track, adjacent when possible
    const c = p.clips.length ? pick(p.clips) : null
    if (!c) return ['none', 'none']
    const next = p.clips.filter(x => x.track === c.track && x.start > c.start).sort((a, b) => a.start - b.start)[0]
    return [c.id, next?.id ?? one()]
  }
  switch (Math.floor(r() * 34)) {
    case 0: return ops.splitAt(p, t(), r() < 0.5 ? undefined : ids())
    case 1: return ops.deleteClips(p, ids())
    case 2: return ops.rippleDelete(p, ids(), ropts())
    case 3: return ops.moveClips(p, ids(), dt(), pick([0, 0, 1, -1, 2]))
    case 4: return ops.trimClip(p, one(), pick(['in', 'out'] as const), t())
    case 5: return ops.rippleTrim(p, one(), pick(['in', 'out'] as const), t(), ropts())
    case 6: return ops.duplicateClips(p, ids(), dt())
    case 7: {
      const src: Clip[] = p.clips.filter(() => r() < 0.5).map(c => ({ ...c, srcOut: c.srcOut + r() * 4 }))
      return ops.pasteClips(p, src, t(), r() < 0.5 ? undefined : pick(p.tracks).id)
    }
    case 8: return ops.setClip(p, one(), { gain: r() * 2, fadeIn: r() * 5, fadeOut: r() * 5 })
    case 9: return ops.setTrack(p, pick(p.tracks).id, { lock: r() < 0.2, target: r() < 0.3 })
    case 10: return r() < 0.5 ? ops.addTrack(p) : ops.removeTrack(p, pick(p.tracks).id)
    case 11: return { ...p, syncLock: r() < 0.6 }
    case 12: return ops.liftRange(p, t(), t(), tracks())
    case 13: return ops.extractRange(p, t(), t(), tracks())
    case 14: return ops.closeGap(p, pick(p.tracks).id, t(), ropts())
    case 15: return ops.closeAllGaps(p, r() < 0.5 ? undefined : pick(p.tracks).id)
    case 16: return ops.trimToPlayhead(p, t(), pick(['prevTail', 'nextHead'] as const), r() < 0.5, tracks())
    case 17: case 18: { const [l, rr] = sorted(); return ops.rollEdit(p, l, rr, t()) }
    case 19: case 20: return ops.setClipSpeed(p, one(), pick([0.1, 0.25, 0.5, 0.75, 1.5, 2, 4, 9, r() * 3]), r() < 0.5, ropts())
    case 21: return ops.rateStretch(p, one(), t())
    case 22: return ops.repeatClips(p, ids(), pick([0, 1, 2, 3]))
    case 23: case 24: case 25: { const [l, rr] = sorted(); return ops.applyCrossfade(p, l, rr, pick([0.05, 0.5, 1, 3, r() * 2])) }
    case 26: { const [l, rr] = sorted(); return ops.removeCrossfade(p, l, rr) }
    case 27: {
      const src = pick([A, B]), d = p.sources[src].duration
      const c = ops.clipFromSource(src, d, r() * d, r() * d, pick(p.tracks).id, t())
      return ops.insertClips(p, r() < 0.3 ? [c, { ...c, start: c.start + 1, speed: pick([0.5, 2]) }] : [c], t(), r() < 0.5 ? undefined : pick(p.tracks).id, ropts())
    }
    case 28: return ops.patchClips(p, ids(), { fadeIn: r() * 3, fadeOut: r() * 3, gain: r(), disabled: r() < 0.3, name: 'n' })
    case 29: return ops.splitAt(p, t())
    case 30: { // cut a clip then crossfade the two halves (the common workflow)
      const c = p.clips.length ? pick(p.clips) : null
      if (!c) return p
      const q = ops.splitAt(p, (c.start + clipEnd(c)) / 2, [c.id])
      const right = q.clips.find(x => x.track === c.track && Math.abs(x.start - (c.start + clipEnd(c)) / 2) < 1e-9)
      return right ? ops.applyCrossfade(q, c.id, right.id, r() * 2) : q
    }
    case 31: return ops.addMarker(p, t())
    case 32: return ops.moveClips(p, [one()], dt())
    default: return ops.trimClip(p, one(), pick(['in', 'out'] as const), t())
  }
}

describe('wave 2 random op sequences', () => {
  for (let seed = 1; seed <= 60; seed++) {
    it(`seed ${seed}: validate() empty after every op, undo/redo exact`, () => {
      const r = rng(seed * 7919)
      let p = proj([
        { id: 'a', src: A, track: 'T1', start: 0, srcIn: 1, srcOut: 8, gain: 1, fadeIn: 0.5, fadeOut: 0.5 },
        { id: 'b', src: B, track: 'T2', start: 2, srcIn: 0.5, srcOut: 4.5, gain: 1, fadeIn: 0, fadeOut: 0, speed: 0.5 },
        { id: 'c', src: A, track: 'T1', start: 7, srcIn: 2, srcOut: 9, gain: 1, fadeIn: 0, fadeOut: 0, speed: 2 },
      ])
      p = { ...p, bpm: 120, syncLock: seed % 3 !== 0 }
      expect(validate(p)).toEqual([])
      let h = createHistory(p)
      const snaps: string[] = [JSON.stringify(p)]
      const stats = { xfades: 0, speeds: 0 }
      for (let i = 0; i < 200; i++) {
        const before = JSON.stringify(p)
        const next = randomOp(p, r)
        expect(JSON.stringify(p), 'input mutated').toBe(before)
        expect(validate(next), `step ${i}`).toEqual([])
        if (next !== p) { p = next; const nh = pushHistory(h, p); if (nh !== h) snaps.push(JSON.stringify(p)); h = nh }
        if (p.clips.some(c => p.clips.some(d => d !== c && d.track === c.track && d.start > c.start && d.start < clipEnd(c) - 1e-6))) stats.xfades++
        if (p.clips.some(c => c.speed && c.speed !== 1)) stats.speeds++
      }
      expect(stats.speeds).toBeGreaterThan(0)
      const steps = h.past.length
      expect(steps).toBe(snaps.length - 1); expect(steps).toBeGreaterThan(10)
      for (let i = 0; i < steps; i++) h = undo(h)
      expect(JSON.stringify(h.present)).toBe(snaps[0])
      for (let i = 0; i < steps; i++) h = redo(h)
      expect(JSON.stringify(h.present)).toBe(JSON.stringify(p))
      xfadeSeeds += stats.xfades > 0 ? 1 : 0
    })
  }
  it('crossfades actually occurred in most sequences (the fuzz exercises overlaps)', () => { expect(xfadeSeeds).toBeGreaterThan(30) })
})
let xfadeSeeds = 0

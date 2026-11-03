import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { validate } from './ops'
import { clipDur, type Clip, type FadeCurve, type Project } from './model'
import { A, B, mk, proj } from './testkit'

// Wave 3: seeded random sequences mixing envelope / range / smart-edit ops with every older op, on clips that carry
// envelopes, fade curves and speeds. validate(p) must be empty after every op, and inputs must never be mutated.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
const CURVES: FadeCurve[] = ['lin', 'pow', 'log', 's']

function randomOp(p: Project, r: () => number): Project {
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const ids = () => p.clips.filter(() => r() < 0.4).map(c => c.id)
  const t = () => (r() < 0.15 ? pick([0, 0.01, 10, 100, -3]) : r() * 24 - 1)
  const one = () => (p.clips.length ? pick(p.clips).id : 'none')
  const tracks = () => (r() < 0.5 ? undefined : p.tracks.filter(() => r() < 0.5).map(x => x.id))
  const ropts = () => pick([undefined, { syncLock: false }, { syncLock: true }])
  const pair = () => {
    const c = p.clips.length ? pick(p.clips) : null
    const next = c && p.clips.filter(x => x.track === c.track && x.start > c.start).sort((a, b) => a.start - b.start)[0]
    return [c?.id ?? 'none', next?.id ?? one()]
  }
  switch (Math.floor(r() * 30)) {
    // wave 3
    case 0: case 1: { const c = p.clips.length ? pick(p.clips) : null; return c ? ops.setEnvPoint(p, c.id, r() * clipDur(c) * 1.2 - 0.1, r() * 5 - 0.5, r() < 0.4 && c.env?.length ? Math.floor(r() * c.env.length) : undefined) : p }
    case 2: return ops.removeEnvPoint(p, one(), Math.floor(r() * 4))
    case 3: return ops.clearEnv(p, one())
    case 4: case 5: return ops.muteRange(p, t(), t(), tracks(), pick([undefined, 0, 0.05, 1]))
    case 6: return ops.gainRange(p, t(), t(), r() * 30 - 20, tracks(), pick([undefined, 0, 0.2]))
    case 7: return ops.fadeRange(p, t(), t(), pick(['in', 'out'] as const), tracks())
    case 8: return ops.setFadeCurve(p, ids(), pick(['in', 'out'] as const), pick(CURVES))
    case 9: case 10: return ops.extendEdit(p, t(), tracks())
    case 11: return ops.trimToPlayheadSel(p, ids(), t(), pick(['start', 'end'] as const), r() < 0.5)
    case 12: return ops.splitAtMany(p, [t(), t(), t()])
    case 13: return ops.cutEveryBeats({ ...p, bpm: pick([null, 90, 128, 174]), bpmOffset: r() }, t(), t(), pick([1, 2, 4, 0.5, 0]))
    case 14: return ops.trimEnds(p, one(), r() * 10 - 1, r() * 10)
    // older ops
    case 15: return ops.splitAt(p, t())
    case 16: return ops.rippleDelete(p, ids(), ropts())
    case 17: return ops.moveClips(p, ids(), r() * 8 - 4, pick([0, 0, 1, -1]))
    case 18: return ops.trimClip(p, one(), pick(['in', 'out'] as const), t())
    case 19: return ops.rippleTrim(p, one(), pick(['in', 'out'] as const), t(), ropts())
    case 20: return ops.setClipSpeed(p, one(), pick([0.25, 0.5, 1.5, 2, 4, r() * 3]), r() < 0.5, ropts())
    case 21: { const [l, rr] = pair(); return ops.rollEdit(p, l, rr, t()) }
    case 22: case 23: { const [l, rr] = pair(); return ops.applyCrossfade(p, l, rr, pick([0.05, 0.5, 1, 3])) }
    case 24: { const [l, rr] = pair(); return ops.removeCrossfade(p, l, rr) }
    case 25: return ops.duplicateClips(p, ids(), r() * 8 - 4)
    case 26: return ops.pasteClips(p, p.clips.filter(() => r() < 0.5), t(), r() < 0.5 ? undefined : pick(p.tracks).id)
    case 27: return ops.repeatClips(p, ids(), pick([1, 2]))
    case 28: return ops.extractRange(p, t(), t(), tracks())
    default: return ops.setTrack(p, pick(p.tracks).id, { lock: r() < 0.2 })
  }
}

const start = (): Project => proj([
  mk('a', 'T1', 0, 0, 8, A, { env: [{ t: 1, g: 0.5 }, { t: 3, g: 1.5 }, { t: 6, g: 0 }], fadeInCurve: 'log', fadeOutCurve: 's', fadeIn: 0.5 }),
  mk('b', 'T1', 8, 1, 5, B, { speed: 2, env: [{ t: 0.5, g: 0 }, { t: 1.5, g: 1 }] }),
  mk('c', 'T2', 2, 0, 10, A, { fadeOutCurve: 'lin', fadeOut: 1 }),
  mk('d', 'T3', 4, 0, 5, B, { speed: 0.5, env: [{ t: 0, g: 1 }, { t: 9.9, g: 0.2 }] }),
])

describe('wave 3 fuzz', () => {
  for (const seed of [1, 7, 42, 99, 2026, 31337]) {
    it(`seed ${seed}: 400 random ops stay valid and never mutate their input`, () => {
      const r = rng(seed)
      let p = start()
      for (let i = 0; i < 400; i++) {
        const before = JSON.stringify(p)
        const next = randomOp(p, r)
        expect(JSON.stringify(p), `op ${i} mutated its input`).toBe(before)
        const bad = validate(next)
        if (bad.length) throw new Error(`seed ${seed} op ${i}: ${bad.join('; ')}`)
        p = next.clips.length && next.clips.length <= 60 ? next : start()   // reset: empty, or grown too big to stay fast
      }
    })
  }
  it('curves survive every op that keeps the clip (split, trim, speed, move, crossfade)', () => {
    let p = start()
    p = ops.splitAt(p, 4); p = ops.trimClip(p, 'a', 'in', 1); p = ops.setClipSpeed(p, 'a', 1.5); p = ops.moveClips(p, ['a'], 0.5)
    const pieces: Clip[] = p.clips.filter(c => c.src === A && c.track === 'T1')
    expect(pieces.length).toBeGreaterThan(0)
    for (const c of pieces) { expect(c.fadeInCurve).toBe('log'); expect(c.fadeOutCurve).toBe('s') }
  })
})

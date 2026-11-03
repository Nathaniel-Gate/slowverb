import { describe, expect, it } from 'vitest'
import * as ops from './ops'
import { clipDur, type Clip } from './model'
import { ENV_GAIN_MAX } from './clipmath'
import { mk, ok, proj, get, on } from './testkit'

const close = (a: number, b: number, d = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(d)
const withEnv = (c: Clip, env: { t: number; g: number }[], extra: Partial<Clip> = {}) => ({ ...c, env, ...extra })

describe('envelope points', () => {
  it('envAt: 1 without env, interpolates, holds past the ends', () => {
    const c = mk('a', 'T1', 0, 0, 10)
    expect(ops.envAt(c, 3)).toBe(1)
    const e = withEnv(c, [{ t: 2, g: 0 }, { t: 4, g: 1 }])
    expect(ops.envAt(e, 0)).toBe(0); expect(ops.envAt(e, 3)).toBe(0.5); expect(ops.envAt(e, 9)).toBe(1)
  })
  it('setEnvPoint adds sorted, clamps t and g, moves by index within neighbours', () => {
    let p = proj([mk('a', 'T1', 0, 0, 10)])
    p = ops.setEnvPoint(p, 'a', 5, 0.5); p = ops.setEnvPoint(p, 'a', 2, 2); p = ops.setEnvPoint(p, 'a', 99, -1)
    expect(get(p, 'a').env).toEqual([{ t: 2, g: 2 }, { t: 5, g: 0.5 }, { t: 10, g: 0 }])
    p = ops.setEnvPoint(p, 'a', 0, 99, 1)          // move middle point left: stops at its neighbour
    expect(get(p, 'a').env![1]).toEqual({ t: 2, g: ENV_GAIN_MAX })
    expect(ops.setEnvPoint(p, 'a', 1, 1, 7)).toBe(p) // bad index
    ok(p)
  })
  it('remove / clear, no-ops return same p, locked refused', () => {
    let p = proj([withEnv(mk('a', 'T1', 0, 0, 10), [{ t: 1, g: 0.5 }, { t: 2, g: 1 }]), mk('b', 'T2', 0, 0, 5)], { lock: ['T2'] })
    p = ops.removeEnvPoint(p, 'a', 0)
    expect(get(p, 'a').env).toEqual([{ t: 2, g: 1 }])
    p = ops.clearEnv(p, 'a'); expect('env' in get(p, 'a')).toBe(false)
    expect(ops.clearEnv(p, 'a')).toBe(p)
    expect(ops.setEnvPoint(p, 'b', 1, 0)).toBe(p)
  })
  it('setFadeCurve sets, treats undefined as pow, rejects junk', () => {
    const p = proj([mk('a', 'T1', 0, 0, 10)])
    expect(ops.setFadeCurve(p, ['a'], 'in', 'pow')).toBe(p)
    const q = ops.setFadeCurve(p, ['a'], 'out', 's')
    expect(get(q, 'a').fadeOutCurve).toBe('s')
    expect(ops.setFadeCurve(p, ['a'], 'in', 'zz' as never)).toBe(p)
  })
})

describe('existing ops keep envelope and curves', () => {
  const base = () => proj([withEnv(mk('a', 'T1', 0, 0, 10), [{ t: 2, g: 0 }, { t: 6, g: 1 }], { fadeInCurve: 'log', fadeOutCurve: 's' })])
  it('split interpolates a point on the cut, gain unchanged everywhere', () => {
    const p0 = base(), p = ops.splitAt(p0, 4)
    ok(p)
    const [l, r] = on(p, 'T1')
    expect(l.env![l.env!.length - 1]).toEqual({ t: 4, g: 0.5 })
    expect(r.env![0]).toEqual({ t: 0, g: 0.5 })
    for (const c of [l, r]) { expect(c.fadeInCurve).toBe('log'); expect(c.fadeOutCurve).toBe('s') }
    for (let t = 0; t < 10; t += 0.37) close(t < 4 ? ops.envAt(l, t) : ops.envAt(r, t - 4), ops.envAt(get(p0, 'a'), t))
  })
  it('head trim shifts points, tail trim clips them', () => {
    let p = ops.trimClip(base(), 'a', 'in', 3)
    expect(get(p, 'a').env).toEqual([{ t: 0, g: 0.25 }, { t: 3, g: 1 }])
    p = ops.trimClip(base(), 'a', 'out', 4)
    expect(get(p, 'a').env).toEqual([{ t: 2, g: 0 }, { t: 4, g: 0.5 }])
    p = ops.rippleTrim(base(), 'a', 'in', 3)
    expect(get(p, 'a').env).toEqual([{ t: 0, g: 0.25 }, { t: 3, g: 1 }]); ok(p)
  })
  it('speed rescales env times', () => {
    const p = ops.setClipSpeed(base(), 'a', 2)
    expect(get(p, 'a').env).toEqual([{ t: 1, g: 0 }, { t: 3, g: 1 }])
    expect(get(p, 'a').fadeInCurve).toBe('log'); ok(p)
  })
  it('move, duplicate, crossfade and roll keep env glued to the audio', () => {
    let p = ops.moveClips(base(), ['a'], 3)
    expect(get(p, 'a').env).toEqual(base().clips[0].env)
    p = ops.splitAt(base(), 5)
    const [l, r] = on(p, 'T1')
    const x = ops.applyCrossfade(p, l.id, r.id, 1)
    ok(x)
    close(ops.envAt(get(x, r.id), 0.5), ops.envAt(get(p, r.id), 0))   // head extended by 0.5: old t=0 now at 0.5
    const rolled = ops.rollEdit(p, l.id, r.id, 4)
    ok(rolled); close(ops.envAt(get(rolled, r.id), 1), ops.envAt(get(p, r.id), 0))
  })
  it('paste repairs a bad envelope and drops unknown curves', () => {
    const bad = { ...mk('z', 'T1', 0, 0, 2), env: [{ t: 5, g: -1 }, { t: NaN, g: 1 }, { t: 0.5, g: 0.5 }], fadeInCurve: 'nope' } as unknown as Clip
    const p = ops.pasteClips(proj([]), [bad], 1)
    ok(p)
    const c = p.clips[0]
    expect(c.fadeInCurve).toBeUndefined()
    expect(c.env![0]).toEqual({ t: 0.5, g: 0.5 }); expect(c.env![1].t).toBe(2); expect(c.env![1].g).toBeCloseTo(1 / 3)
  })
})

describe('range mute / gain / fade', () => {
  it('muteRange dips to silence over [a,b) with ramps outside, no split', () => {
    const p = ops.muteRange(proj([mk('a', 'T1', 1, 0, 10)]), 3, 5, undefined, 0.1)
    ok(p); expect(p.clips).toHaveLength(1)
    const c = get(p, 'a')
    for (const t of [3, 4, 4.99]) expect(ops.envAt(c, t - 1)).toBe(0)
    expect(ops.envAt(c, 2.95 - 1)).toBeCloseTo(0.5); expect(ops.envAt(c, 1)).toBe(1); expect(ops.envAt(c, 8)).toBe(1)
    expect(ops.muteRange(p, 3, 5, undefined, 0.1)).toBe(p)       // idempotent: same object
  })
  it('gainRange multiplies an existing envelope; 0 dB is a no-op', () => {
    const p0 = proj([withEnv(mk('a', 'T1', 0, 0, 10), [{ t: 0, g: 0.5 }, { t: 10, g: 0.5 }])])
    const p = ops.gainRange(p0, 2, 4, -6, undefined, 0)
    close(ops.envAt(get(p, 'a'), 3), 0.5 * 10 ** (-6 / 20)); expect(ops.envAt(get(p, 'a'), 5)).toBe(0.5)
    expect(ops.gainRange(p0, 2, 4, 0)).toBe(p0); ok(p)
  })
  it('respects tracks, targeted and locked tracks', () => {
    const p0 = proj([mk('a', 'T1', 0, 0, 10), mk('b', 'T2', 0, 0, 5), mk('c', 'T3', 0, 0, 5)], { lock: ['T3'] })
    const p = ops.muteRange(p0, 1, 2, ['T2', 'T3'])
    expect(get(p, 'a').env).toBeUndefined(); expect(get(p, 'b').env).toBeDefined(); expect(get(p, 'c')).toBe(get(p0, 'c'))
  })
  it('fadeRange out silences the crossing clip after b; in silences before a', () => {
    const p0 = proj([mk('a', 'T1', 0, 0, 5), mk('b', 'T1', 6, 0, 2)])
    const out = ops.fadeRange(p0, 2, 4, 'out')
    const a = get(out, 'a')
    expect(ops.envAt(a, 1)).toBe(1); expect(ops.envAt(a, 3)).toBeCloseTo(0.5); expect(ops.envAt(a, 4.5)).toBe(0)
    expect(get(out, 'b')).toBe(get(p0, 'b'))
    const inn = get(ops.fadeRange(p0, 2, 4, 'in'), 'a')
    expect(ops.envAt(inn, 1)).toBe(0); expect(ops.envAt(inn, 3)).toBeCloseTo(0.5); expect(ops.envAt(inn, 4.5)).toBe(1)
    expect(clipDur(a)).toBe(5)
  })
})

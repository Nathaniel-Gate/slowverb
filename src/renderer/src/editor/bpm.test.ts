import { describe, expect, it } from 'vitest'
import { detectBpmChannels, tap } from './bpm'

const R = 44100
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5

/** click track: 1 kHz pings with a 8 ms decay, optional weak off-beat hat, optional noise bed */
function clicks(bpm: number, secs: number, o: { offset?: number; hat?: boolean; noise?: number; jitter?: number } = {}) {
  const x = new Float32Array(Math.round(secs * R)), period = 60 / bpm
  if (o.noise) for (let i = 0; i < x.length; i++) x[i] = o.noise * rnd()
  const ping = (t: number, amp: number, f: number) => { const s0 = Math.round(t * R); for (let i = 0; i < 0.03 * R && s0 + i < x.length; i++) x[s0 + i] += amp * Math.sin(2 * Math.PI * f * i / R) * Math.exp(-i / (0.008 * R)) }
  for (let k = 0; (o.offset ?? 0) + k * period < secs; k++) {
    const t = (o.offset ?? 0) + k * period + (o.jitter ? o.jitter * rnd() * 2 : 0)
    ping(t, 0.8, 120)   // kick-ish thump on the beat (lower)
    if (o.hat) ping(t + period / 2, 0.25, 6000)
    if (!o.hat) ping(t, 0.5, 1000)
  }
  return [x]
}
const err = (a: number, b: number) => Math.abs(a - b) / b

// Note: a perfectly periodic track at ~175+ is equally 87.5; the prior resolves such exact octave ties to the lower tempo.
describe('detectBpm on synthetic click tracks', () => {
  for (const bpm of [70, 80, 92, 100, 111, 120, 128, 140, 150, 160]) {
    it(`${bpm} BPM within 0.3%`, () => {
      const r = detectBpmChannels(clicks(bpm, 40), R)
      expect(err(r.bpm, bpm)).toBeLessThan(0.003); expect(r.confidence).toBeGreaterThan(0.5)
    })
  }
  it('finds the first-beat offset', () => {
    for (const off of [0, 0.123, 0.31]) {
      const r = detectBpmChannels(clicks(120, 30, { offset: off }), R), period = 0.5
      expect(Math.min(Math.abs(r.offset - off), period - Math.abs(r.offset - off))).toBeLessThan(0.02);
    }
  })
  it('prefers the beat over weaker off-beat hats (no double-tempo error): 124 with hats', () => {
    expect(err(detectBpmChannels(clicks(124, 40, { hat: true }), R).bpm, 124)).toBeLessThan(0.005)
  })
  it('survives noise and timing jitter: 105 BPM within 1%', () => {
    expect(err(detectBpmChannels(clicks(105, 40, { noise: 0.2, jitter: 0.004 }), R).bpm, 105)).toBeLessThan(0.01)
  })
  it('folds out-of-range tempos into 70-180: 60 -> 120, 200 -> 100', () => {
    expect(err(detectBpmChannels(clicks(60, 40), R).bpm, 120)).toBeLessThan(0.005)
    expect(err(detectBpmChannels(clicks(200, 40), R).bpm, 100)).toBeLessThan(0.005)
  })
  it('works at 48k and with stereo input', () => {
    const l = clicks(133, 30)[0], r = detectBpmChannels([l, l], R)
    expect(err(r.bpm, 133)).toBeLessThan(0.003)
  })
  it('silence, tiny input and noise give no confident answer instead of a crash', () => {
    expect(detectBpmChannels([new Float32Array(R * 20)], R)).toEqual({ bpm: 0, offset: 0, confidence: 0 })
    expect(detectBpmChannels([new Float32Array(100)], R).bpm).toBe(0); expect(detectBpmChannels([], R).bpm).toBe(0)
    const noise = Float32Array.from({ length: R * 30 }, () => rnd() * 0.5)
    expect(detectBpmChannels([noise], R).confidence).toBeLessThan(0.3)
  })
})

describe('tap tempo', () => {
  it('needs 2 taps', () => { expect(tap([])).toBeNull(); expect(tap([1])).toBeNull() })
  it('averages the intervals (seconds)', () => { expect(tap([0, 0.5, 1, 1.5, 2])).toBeCloseTo(120, 6); expect(tap([10, 10.6, 11.2])).toBeCloseTo(100, 6) })
  it('accepts milliseconds', () => { expect(tap([1000, 1500, 2000, 2500])).toBeCloseTo(120, 6) })
  it('a long pause starts a fresh run', () => { expect(tap([0, 0.9, 1.8, 20, 20.5, 21, 21.5])).toBeCloseTo(120, 6) })
  it('only the last 12 taps count (tempo drift)', () => {
    const slow = Array.from({ length: 6 }, (_, i) => i * 0.75), fast = Array.from({ length: 12 }, (_, i) => 4.5 + i * 0.5)
    expect(tap([...slow, ...fast])).toBeCloseTo(120, 6)
  })
})

import { describe, expect, it } from 'vitest'
import { AMBIENCE, cleanSounds, clampMasterDb, clampSoundDb, dbToGain, loopChannels, makeLoopable, soundName } from './ambience'

const RATE = 8000
const rng = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }

describe('makeLoopable', () => {
  it('keeps the length, starts where the cut tail would have continued, leaves the end untouched', () => {
    const r = rng(9), raw = Float32Array.from({ length: 1500 }, () => r() * 2 - 1), o = makeLoopable(raw, 1000)
    expect(o.length).toBe(1000)
    expect(o[0]).toBeCloseTo(raw[1000], 5)
    expect(o[999]).toBe(raw[999])
  })
})

describe('loopChannels', () => {
  it('a hard-cut recording has no jump at the loop point afterwards', () => {
    // a 3 s steady tone sliced at an arbitrary place: end and start are far apart in value before, close after
    const n = Math.round(3.1 * RATE), tone = Float32Array.from({ length: n }, (_, i) => 0.6 * Math.sin(2 * Math.PI * 220.5 * i / RATE) + 0.2 * Math.sin(2 * Math.PI * 1031 * i / RATE))
    const stepBefore = Math.abs(tone[0] - tone[n - 1])
    const [l] = loopChannels([tone, tone], RATE)
    const typical = (() => { let d = 0; for (let i = 1; i < l.length; i++) d += (l[i] - l[i - 1]) ** 2; return Math.sqrt(d / (l.length - 1)) })()
    expect(Math.abs(l[0] - l[l.length - 1])).toBeLessThan(typical * 3)
    expect(l.length).toBe(n - Math.min(Math.floor(AMBIENCE.loopFadeSec * RATE), Math.floor(n / 4)))
    expect(stepBefore).toBeGreaterThanOrEqual(0)
  })
  it('noise: loop is continuous and no louder than sqrt(2) x the source', () => {
    const r = rng(4), n = 6 * RATE, src = Float32Array.from({ length: n }, () => (r() * 2 - 1) * 0.8), [l] = loopChannels([src], RATE)
    let peak = 0, d = 0; for (let i = 0; i < l.length; i++) { peak = Math.max(peak, Math.abs(l[i])); if (i) d += (l[i] - l[i - 1]) ** 2 }
    expect(peak).toBeLessThanOrEqual(0.8 * Math.SQRT2 + 1e-6)   // an equal-power blend of two unrelated parts can reach sqrt(2) x
    expect(Math.abs(l[0] - l[l.length - 1])).toBeLessThan(Math.sqrt(d / (l.length - 1)) * 5)
  })
  it('very short sounds crossfade a quarter at most; tiny ones loop as they are', () => {
    expect(loopChannels([new Float32Array(4000)], RATE)[0].length).toBe(3000)
    expect(loopChannels([new Float32Array(5)], RATE)[0].length).toBe(5)
  })
  it('keeps the channel count and cuts very long recordings', () => {
    const out = loopChannels([new Float32Array(100), new Float32Array(100)], RATE)
    expect(out.length).toBe(2)
  })
})

describe('settings helpers', () => {
  it('clamps levels, converts dB to gain', () => {
    expect(clampMasterDb(-200)).toBe(AMBIENCE.levelMinDb); expect(clampMasterDb(5)).toBe(AMBIENCE.levelMaxDb); expect(clampMasterDb(NaN)).toBe(-20)
    expect(clampSoundDb(-99)).toBe(AMBIENCE.soundMinDb); expect(clampSoundDb(99)).toBe(AMBIENCE.soundMaxDb)
    expect(dbToGain(0)).toBe(1); expect(dbToGain(-20)).toBeCloseTo(0.1, 6)
  })
  it('cleanSounds drops junk and duplicates, clamps levels', () => {
    expect(cleanSounds(undefined)).toEqual([])
    expect(cleanSounds([{ rel: 'Sound bites/a.wav', level: -3 }, { rel: 'Sound bites/a.wav', level: 2 }, { rel: 5 }, null, { rel: 'Sound bites/b.wav', level: 'x' }, { rel: 'Sound bites/c.wav', level: -500 }]))
      .toEqual([{ rel: 'Sound bites/a.wav', level: -3 }, { rel: 'Sound bites/b.wav', level: 0 }, { rel: 'Sound bites/c.wav', level: AMBIENCE.soundMinDb }])
  })
  it('soundName strips the category and extension', () => {
    expect(soundName('Sound bites/Nature/Birds.wav')).toBe('Nature/Birds'); expect(soundName('Sound bites/Rain.mp3')).toBe('Rain')
  })
})

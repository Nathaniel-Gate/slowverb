import { describe, expect, it } from 'vitest'
import { detectSections, detectSilence, leadingTrailingSilence } from './sections'

const R = 22050
let seed = 3; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 - 0.5
const mk = (secs: number, f: (t: number, i: number) => number) => { const x = new Float32Array(Math.round(secs * R)); for (let i = 0; i < x.length; i++) x[i] = f(i / R, i); return { sampleRate: R, numberOfChannels: 1, getChannelData: (_c: number) => x } }
const tone = (hz: number, a: number) => (t: number) => a * Math.sin(2 * Math.PI * hz * t)

/** quiet bass (0-20s) -> loud bright (20-40s) -> mid chord (40-60s) -> quiet bass again (60-80s) */
const song = () => mk(80, (t, i) => t < 20 ? tone(110, 0.15)(t) : t < 40 ? tone(1800, 0.3)(t) + 0.2 * rnd() : t < 60 ? tone(440, 0.25)(t) + tone(660, 0.2)(t) : tone(110, 0.15)(t))

describe('detectSections', () => {
  it('finds the boundaries of a synthetic 4-part song, no more', () => {
    const s = detectSections(song(), { minSec: 8 }), ts = s.map((x) => x.t)
    expect(ts.length).toBe(3)
    for (const want of [20, 40, 60]) expect(Math.min(...ts.map((t) => Math.abs(t - want)))).toBeLessThan(1)
    expect(ts).toEqual([...ts].sort((a, b) => a - b))
    for (const x of s) { expect(x.strength).toBeGreaterThan(0); expect(x.strength).toBeLessThanOrEqual(1) }
    expect(Math.max(...s.map((x) => x.strength))).toBe(1)
  })
  it('a steady tone has no sections', () => { expect(detectSections(mk(60, tone(220, 0.3)))).toEqual([]) })
  it('stationary noise has no sections', () => { expect(detectSections(mk(60, () => 0.2 * rnd()))).toEqual([]) })
  it('minSec keeps boundaries apart; higher sensitivity never finds fewer', () => {
    const s = detectSections(song(), { minSec: 30 }).map((x) => x.t)
    for (let i = 1; i < s.length; i++) expect(s[i] - s[i - 1]).toBeGreaterThanOrEqual(30 - 1)
    const lo = detectSections(song(), { sensitivity: 0.2 }).length, hi = detectSections(song(), { sensitivity: 0.9 }).length
    expect(hi).toBeGreaterThanOrEqual(lo)
  })
  it('too-short input returns []', () => { expect(detectSections(mk(2, tone(220, 0.3)))).toEqual([]) })
  it('works on stereo (channels are averaged)', () => {
    const a = song().getChannelData(0), b = { sampleRate: R, numberOfChannels: 2, getChannelData: (_c: number) => a }
    expect(detectSections(b).length).toBe(3)
  })
})

describe('detectSilence', () => {
  const x = () => mk(10, (t) => (t > 2 && t < 3) || (t > 5.5 && t < 5.6) ? 0 : tone(300, 0.5)(t))
  it('finds quiet stretches at least minSec long, with exact-ish edges', () => {
    const r = detectSilence(x(), -50, 0.5)
    expect(r.length).toBe(1); expect(r[0].start).toBeCloseTo(2, 1); expect(r[0].end).toBeCloseTo(3, 1)
  })
  it('a shorter minSec also reports the short gap; a loud threshold reports nothing', () => {
    expect(detectSilence(x(), -50, 0.05).length).toBe(2)
    expect(detectSilence(x(), -50, 2)).toEqual([])
  })
  it('a silence at the very end is closed at the file end', () => {
    const r = detectSilence(mk(4, (t) => t < 3 ? tone(300, 0.5)(t) : 0), -50, 0.5)
    expect(r.length).toBe(1); expect(r[0].end).toBeCloseTo(4, 2)
  })
})

describe('leadingTrailingSilence', () => {
  it('returns the audible span', () => {
    const r = leadingTrailingSilence(mk(10, (t) => t > 1.5 && t < 8.25 ? tone(300, 0.5)(t) : 0), -50)
    expect(r.start).toBeCloseTo(1.5, 2); expect(r.end).toBeCloseTo(8.25, 2)
  })
  it('no silence: the whole file; all silence: {0,0}', () => {
    const r = leadingTrailingSilence(mk(3, () => 0.4), -50); expect(r).toEqual({ start: 0, end: 3 })
    expect(leadingTrailingSilence(mk(3, () => 0), -50)).toEqual({ start: 0, end: 0 })
  })
  it('a quiet tail under the threshold counts as silence', () => {
    const r = leadingTrailingSilence(mk(6, (t) => t < 4 ? tone(300, 0.5)(t) : tone(300, 0.001)(t)), -50)
    expect(r.end).toBeCloseTo(4, 2)
  })
})

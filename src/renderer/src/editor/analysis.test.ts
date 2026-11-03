import { describe, expect, it } from 'vitest'
import { analyseChannels, analyseClip, gainToTarget, kWeighting } from './analysis'

const R = 48000
const sine = (amp: number, f: number, secs: number, rate = R) => Float32Array.from({ length: Math.round(secs * rate) }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / rate))

describe('analyseClip', () => {
  it('peak and rms of a full-scale sine (rms = -3.01 dB)', () => {
    const a = analyseChannels([sine(1, 1000, 2)], R, 0, 2)
    expect(a.peakDb).toBeCloseTo(0, 2); expect(a.rmsDb).toBeCloseTo(-3.01, 1)
  })
  it('a quarter-amplitude sine is -12 dB peak', () => { expect(analyseChannels([sine(0.25, 440, 1)], R, 0, 1).peakDb).toBeCloseTo(-12.04, 1) })
  it('0 dBFS 1kHz sine: -3.01 LUFS on one channel, 0 LUFS on two (BS.1770 reference)', () => {
    const one = analyseChannels([sine(1, 1000, 5), new Float32Array(R * 5)], R, 0, 5).lufsApprox
    const two = analyseChannels([sine(1, 1000, 5), sine(1, 1000, 5)], R, 0, 5).lufsApprox
    expect(one).toBeCloseTo(-3.01, 0.7); expect(two).toBeCloseTo(0, 0.7)
  })
  it('K-weighting works at 44.1k too, and a 1 kHz level scales 1:1 with gain', () => {
    const a = analyseChannels([sine(0.5, 1000, 4, 44100), sine(0.5, 1000, 4, 44100)], 44100, 0, 4).lufsApprox
    expect(a).toBeCloseTo(-6.02, 0.7); expect(kWeighting(44100)).toHaveLength(2)
  })
  it('only the srcIn..srcOut window is measured', () => {
    const x = new Float32Array(R * 2); x.set(sine(0.5, 300, 1), 0)         // loud first second, silent second
    expect(analyseChannels([x], R, 0, 1).peakDb).toBeCloseTo(-6.02, 1)
    expect(analyseChannels([x], R, 1, 2).peakDb).toBe(-120)
  })
  it('silence and empty windows report the floor, never -Infinity or NaN', () => {
    for (const a of [analyseChannels([new Float32Array(1000)], R, 0, 1), analyseChannels([sine(1, 100, 1)], R, 5, 6), analyseChannels([], R, 0, 1)])
      for (const v of Object.values(a)) { expect(Number.isFinite(v)).toBe(true); expect(v).toBe(-120) }
  })
  it('works on an AudioBuffer-like object', () => {
    const buf = { sampleRate: R, numberOfChannels: 1, getChannelData: () => sine(0.5, 440, 1) }
    expect(analyseClip(buf, 0, 1).peakDb).toBeCloseTo(-6.02, 1)
  })
  it('gating ignores long silence: loudness of tone + silence equals the tone alone', () => {
    const tone = sine(0.5, 1000, 3), padded = new Float32Array(R * 9); padded.set(tone, 0)
    expect(analyseChannels([padded], R, 0, 9).lufsApprox).toBeCloseTo(analyseChannels([tone], R, 0, 3).lufsApprox, 0)
  })
})
describe('gainToTarget', () => {
  const a = { peakDb: -12, rmsDb: -20, lufsApprox: -18 }
  it('peak mode lifts -12 dB to -1 dB', () => { expect(20 * Math.log10(gainToTarget(a, -1, 'peak'))).toBeCloseTo(11, 6) })
  it('rms mode targets the rms figure; can attenuate', () => {
    expect(20 * Math.log10(gainToTarget(a, -14, 'rms'))).toBeCloseTo(6, 6)
    expect(20 * Math.log10(gainToTarget({ ...a, peakDb: 3 }, -1, 'peak'))).toBeCloseTo(-4, 6)
  })
  it('silence gives unity; boost is capped at maxGainDb', () => {
    expect(gainToTarget({ peakDb: -120, rmsDb: -120, lufsApprox: -120 }, -1, 'peak')).toBe(1)
    expect(20 * Math.log10(gainToTarget({ peakDb: -80, rmsDb: -90, lufsApprox: -85 }, -1, 'peak'))).toBeCloseTo(24, 6)
  })
})

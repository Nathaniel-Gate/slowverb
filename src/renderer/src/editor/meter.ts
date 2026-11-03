import { EDITOR_AUDIO } from '../config/editorAudio'

export type MeterReading = { l: number; r: number; peakL: number; peakR: number; clip: boolean }
type Chan = { level: number; peak: number; peakAt: number }
export type MeterState = { l: Chan; r: Chan; clipAt: number }
const E = EDITOR_AUDIO

export const newMeterState = (): MeterState => ({ l: { level: 0, peak: 0, peakAt: -1e9 }, r: { level: 0, peak: 0, peakAt: -1e9 }, clipAt: -1e9 })

/** Pure: one meter update. `inst` = the highest |sample| seen since the last read, per channel (linear 0..1+), `now` seconds.
 *  Level: instant attack, then falls at meterFallDbPerSec. Peak hold: stays meterHoldSec, then falls the same way.
 *  clip: true while within meterClipHoldSec of the last sample at or above full scale. Values are linear and capped at 1. */
export function stepMeter(s: MeterState, inst: { l: number; r: number }, now: number, dt: number): { state: MeterState; read: MeterReading } {
  const fall = 10 ** (-E.meterFallDbPerSec * Math.max(0, dt) / 20)
  const ch = (c: Chan, x: number): Chan => {
    const level = Math.max(x, c.level * fall)
    const hold = x >= c.peak || now - c.peakAt < E.meterHoldSec
    return { level, peak: x >= c.peak ? x : hold ? c.peak : Math.max(x, c.peak * fall), peakAt: x >= c.peak ? now : c.peakAt }
  }
  const state: MeterState = { l: ch(s.l, inst.l), r: ch(s.r, inst.r), clipAt: Math.max(inst.l, inst.r) >= 1 ? now : s.clipAt }
  const cap = (v: number) => Math.min(1, v)
  return { state, read: { l: cap(state.l.level), r: cap(state.r.level), peakL: cap(state.l.peak), peakR: cap(state.r.peak), clip: now - state.clipAt < E.meterClipHoldSec } }
}

/** Stereo master meter tap. Call read() once per animation frame; the analysers' window (config meterFft) is longer than a frame,
 *  so no sample is missed. Values are linear 0..1 (the UI scales to dB); `clip` latches for a few seconds. */
export function createMeter(ctx: BaseAudioContext, source: AudioNode) {
  const split = ctx.createChannelSplitter(2), an = [ctx.createAnalyser(), ctx.createAnalyser()]
  an.forEach((a) => { a.fftSize = E.meterFft; a.smoothingTimeConstant = 0 })
  source.connect(split); split.connect(an[0], 0); split.connect(an[1], 1)
  const bufs = an.map(() => new Float32Array(E.meterFft))
  let state = newMeterState(), last = 0
  const peakOf = (i: number) => { an[i].getFloatTimeDomainData(bufs[i]); let m = 0; for (const v of bufs[i]) { const a = Math.abs(v); if (a > m) m = a } return m }
  return {
    read(): MeterReading {
      const now = performance.now() / 1000, dt = last ? now - last : 0; last = now
      const out = stepMeter(state, { l: peakOf(0), r: peakOf(1) }, now, dt)
      state = out.state; return out.read
    },
    reset() { state = newMeterState() },
    disconnect() { try { source.disconnect(split) } catch { /* already gone */ } }
  }
}

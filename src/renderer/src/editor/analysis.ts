import { EDITOR_AUDIO } from '../config/editorAudio'

/** The bits of an AudioBuffer analysis needs (so it runs in plain tests too). */
export type AudioLike = { sampleRate: number; numberOfChannels: number; getChannelData(c: number): Float32Array }
export type Analysis = { peakDb: number; rmsDb: number; lufsApprox: number }

const db = (lin: number) => (lin > 1e-12 ? 20 * Math.log10(lin) : EDITOR_AUDIO.silenceDb)

type Biquad = { b: [number, number, number]; a: [number, number] }
/** ITU-R BS.1770 K-weighting (shelf then high-pass), coefficients for any sample rate. */
export function kWeighting(rate: number): Biquad[] {
  const shelf = (() => {
    const f0 = 1681.974450955533, G = 3.999843853973347, Q = 0.7071752369554196
    const K = Math.tan(Math.PI * f0 / rate), Vh = 10 ** (G / 20), Vb = Vh ** 0.4996667741545416, a0 = 1 + K / Q + K * K
    return { b: [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] } as Biquad
  })()
  const hp = (() => {
    const f0 = 38.13547087602444, Q = 0.5003270373238773
    const K = Math.tan(Math.PI * f0 / rate), a0 = 1 + K / Q + K * K
    return { b: [1, -2, 1], a: [2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0] } as Biquad
  })()
  return [shelf, hp]
}
function filtered(x: Float32Array, from: number, to: number, stages: Biquad[]): Float64Array {
  let cur = Float64Array.from(x.subarray(from, to))
  for (const { b, a } of stages) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0
    for (let i = 0; i < cur.length; i++) {
      const x0 = cur[i], y0 = b[0] * x0 + b[1] * x1 + b[2] * x2 - a[0] * y1 - a[1] * y2
      x2 = x1; x1 = x0; y2 = y1; y1 = y0; cur[i] = y0
    }
  }
  return cur
}
/** Integrated loudness (BS.1770-4 style: K-weighted 400ms blocks, 75% overlap, -70 abs gate, -10 LU relative gate). Channels weighted 1. */
export function lufsOf(chs: Float32Array[], rate: number, from: number, to: number): number {
  const E = EDITOR_AUDIO, stages = kWeighting(rate), f = chs.map((c) => filtered(c, from, to, stages))
  const len = to - from, block = Math.round(E.lufsBlockSec * rate), step = Math.round(E.lufsStepSec * rate)
  const power: number[] = []
  const meanSq = (a: number, b: number) => { let s = 0; for (const c of f) { let t = 0; for (let i = a; i < b; i++) t += c[i] * c[i]; s += t / (b - a) } return s }
  if (len < block) power.push(meanSq(0, len))
  else for (let a = 0; a + block <= len; a += step) power.push(meanSq(a, a + block))
  const lk = (z: number) => -0.691 + 10 * Math.log10(z)
  const abs = power.filter((z) => z > 0 && lk(z) > E.lufsAbsGate)
  if (!abs.length) return E.silenceDb
  const rel = lk(abs.reduce((s, z) => s + z, 0) / abs.length) + E.lufsRelGate, kept = abs.filter((z) => lk(z) > rel)
  return lk((kept.length ? kept : abs).reduce((s, z) => s + z, 0) / (kept.length ? kept : abs).length)
}

/** Pure channel version of analyseClip. srcIn/srcOut in seconds; peak across all channels; rms over all channels together. */
export function analyseChannels(chs: Float32Array[], rate: number, srcIn: number, srcOut: number): Analysis {
  const n = chs[0]?.length ?? 0, from = Math.max(0, Math.min(n, Math.floor(srcIn * rate))), to = Math.max(from, Math.min(n, Math.ceil(srcOut * rate)))
  if (to <= from) return { peakDb: EDITOR_AUDIO.silenceDb, rmsDb: EDITOR_AUDIO.silenceDb, lufsApprox: EDITOR_AUDIO.silenceDb }
  let peak = 0, sq = 0
  for (const c of chs) for (let i = from; i < to; i++) { const v = c[i]; if (Math.abs(v) > peak) peak = Math.abs(v); sq += v * v }
  return { peakDb: db(peak), rmsDb: db(Math.sqrt(sq / ((to - from) * chs.length))), lufsApprox: lufsOf(chs, rate, from, to) }
}
export function analyseClip(buf: AudioLike, srcIn: number, srcOut: number): Analysis {
  return analyseChannels(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), buf.sampleRate, srcIn, srcOut)
}

/** Linear gain that brings the clip to `targetDb` by peak or rms. Silence (nothing to measure) returns 1; boost is capped at config maxGainDb. */
export function gainToTarget(a: Analysis, targetDb: number, mode: 'peak' | 'rms'): number {
  const measured = mode === 'peak' ? a.peakDb : a.rmsDb
  if (measured <= EDITOR_AUDIO.silenceDb + 1) return 1
  return 10 ** (Math.min(targetDb - measured, EDITOR_AUDIO.maxGainDb) / 20)
}

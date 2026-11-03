import { EDITOR_AUDIO } from '../config/editorAudio'
import type { AudioLike } from './analysis'

export type BpmResult = { bpm: number; offset: number; confidence: number }
const E = EDITOR_AUDIO

/** Pure: onset-strength envelope, one value per `hop` samples. Two bands (low <~150 Hz for kicks, the rest for everything else),
 *  log-compressed energy, positive differences only, each band scaled to unit mean, then the local mean (~0.6 s) subtracted. */
export function onsetEnvelope(chs: Float32Array[], rate: number, hop = E.bpmHop, maxSec = E.bpmAnalyseSec): Float32Array {
  const n = Math.min(chs[0]?.length ?? 0, Math.floor(maxSec * rate)), frames = Math.floor(n / hop)
  if (frames < 3) return new Float32Array(0)
  const a = 1 - Math.exp(-2 * Math.PI * 150 / rate), lo = new Float32Array(frames), hi = new Float32Array(frames)
  let y = 0
  for (let f = 0; f < frames; f++) {
    let el = 0, eh = 0
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      let m = 0; for (const c of chs) m += c[i]; m /= chs.length
      y += a * (m - y); el += y * y; const h = m - y; eh += h * h
    }
    lo[f] = Math.log1p(1000 * Math.sqrt(el / hop)); hi[f] = Math.log1p(1000 * Math.sqrt(eh / hop))
  }
  const diff = (e: Float32Array) => { const d = new Float32Array(frames); let s = 0; for (let i = 1; i < frames; i++) { d[i] = Math.max(0, e[i] - e[i - 1]); s += d[i] } const m = s / frames || 1; return d.map((v) => v / m) }
  const dl = diff(lo), dh = diff(hi), o = new Float32Array(frames)
  for (let i = 0; i < frames; i++) o[i] = dl[i] + dh[i]
  const w = Math.max(2, Math.round(0.6 * rate / hop)), out = new Float32Array(frames)
  let run = 0
  for (let i = 0; i < frames; i++) { run += o[i]; if (i >= w) run -= o[i - w]; out[i] = Math.max(0, o[i] - run / Math.min(i + 1, w)) }
  return out
}

const interp = (x: ArrayLike<number>, t: number) => { const i = Math.floor(t); if (i < 0 || i + 1 >= x.length) return 0; const f = t - i; return x[i] * (1 - f) + x[i + 1] * f }
const smooth = (x: Float32Array) => { const o = new Float32Array(x.length); for (let i = 1; i < x.length - 1; i++) o[i] = 0.25 * x[i - 1] + 0.5 * x[i] + 0.25 * x[i + 1]; return o }

/** Pure: tempo from an onset envelope sampled at `fps` frames per second. Folded into config bpmMin..bpmMax.
 *  1) autocorrelation + harmonic comb picks the tempo (log-normal prior around 120 guards octave errors),
 *  2) a phase-coherent beat-train search around it refines tempo to ~0.05% and finds the first beat. */
export function tempoFromOnsets(on: Float32Array, fps: number): BpmResult {
  const n = on.length, none = { bpm: 0, offset: 0, confidence: 0 }
  if (n < fps * 4) return none
  const maxLag = Math.ceil(fps * 60 / E.bpmMin * 4) + 2
  if (n < maxLag * 2) return none
  const ac = new Float64Array(maxLag + 1)
  for (let l = 0; l <= maxLag; l++) { let s = 0; for (let i = 0; i + l < n; i++) s += on[i] * on[i + l]; ac[l] = s / n }
  if (ac[0] < 1e-9) return none
  const prior = (b: number) => Math.exp(-0.5 * (Math.log2(b / E.bpmPriorCenter) / E.bpmPriorOctaves) ** 2)
  // coarse: autocorrelation + harmonic comb over the tempo range; keep the few best distinct peaks as candidates
  const grid: { b: number; s: number }[] = []
  for (let b = E.bpmMin; b <= E.bpmMax; b += 0.25) {
    const L = fps * 60 / b
    let s = 0; for (let m = 1; m <= 4; m++) s += interp(ac, m * L) / m
    grid.push({ b, s: s * prior(b) })
  }
  const cands: number[] = []
  for (const g of [...grid].sort((x, y) => y.s - x.s)) {
    const i = grid.indexOf(g)
    if ((i > 0 && grid[i - 1].s > g.s) || (i < grid.length - 1 && grid[i + 1].s > g.s)) continue   // not a local peak
    if (cands.every((c) => Math.abs(c - g.b) / c > 0.03)) cands.push(g.b)
    if (cands.length >= E.bpmCandidates) break
  }
  // fine: for each candidate maximise the summed envelope at beat positions over tempo (+-2%) and phase; the best (prior-weighted) wins
  const sm = smooth(on)
  let rb = cands[0] ?? E.bpmPriorCenter, rphi = 0, rs = -1
  for (const c of cands) {
    let cb = c, cphi = 0, cs = -1
    for (let b = c * 0.98; b <= c * 1.02; b += c * 0.0002) {
      const L = fps * 60 / b, beats = Math.floor((n - 2) / L)
      for (let phi = 0; phi < L; phi += 0.5) {
        let s = 0; for (let k = 0; k < beats; k++) s += interp(sm, phi + k * L)
        s /= beats
        if (s > cs) { cs = s; cb = b; cphi = phi }
      }
    }
    if (cs * prior(cb) > rs) { rs = cs * prior(cb); rb = cb; rphi = cphi }
  }
  const L = fps * 60 / rb
  return { bpm: rb, offset: rphi / fps, confidence: Math.max(0, Math.min(1, interp(ac, L) / ac[0])) }
}

/** Pure channel version of detectBpm. */
export function detectBpmChannels(chs: Float32Array[], rate: number): BpmResult {
  return tempoFromOnsets(onsetEnvelope(chs, rate), rate / E.bpmHop)
}
/** Tempo (folded to 70-180 BPM), first-beat offset in seconds, and confidence 0..1 (the beat-lag autocorrelation relative to its peak:
 *  ~1 for a click track, 0.1-0.4 typical for real music, near 0 for noise). Analyses the first config bpmAnalyseSec seconds.
 *  Nothing found (silence, very short) = { bpm: 0, offset: 0, confidence: 0 }. */
export function detectBpm(buf: AudioLike): BpmResult {
  return detectBpmChannels(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), buf.sampleRate)
}

/** Tap tempo. `times` are tap moments in SECONDS (values whose gaps exceed 10 are taken as milliseconds). A gap longer than config
 *  bpmTapReset starts a fresh run; the last 12 taps of the run give the average interval. Needs 2+ taps, else null. */
export function tap(times: number[]): number | null {
  if (times.length < 2) return null
  const ms = Math.abs(times[times.length - 1] - times[0]) > 10 * times.length
  const t = times.map((x) => (ms ? x / 1000 : x))
  let start = t.length - 1
  while (start > 0 && t[start] - t[start - 1] <= E.bpmTapReset && t[start] > t[start - 1]) start--
  const run = t.slice(Math.max(start, t.length - 12))
  if (run.length < 2) return null
  const bpm = 60 * (run.length - 1) / (run[run.length - 1] - run[0])
  return Number.isFinite(bpm) && bpm > 0 ? bpm : null
}

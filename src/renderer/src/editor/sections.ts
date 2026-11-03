import { EDITOR_AUDIO as E } from '../config/editorAudio'
import type { AudioLike } from './analysis'

export type Section = { t: number; strength: number }   // t = boundary time in SOURCE seconds, strength 0..1 (1 = the biggest change in the file)

/** In-place radix-2 FFT (re/im length = power of two). */
function fft(re: Float64Array, im: Float64Array, cos: Float64Array, sin: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) { const a = re[i]; re[i] = re[j]; re[j] = a; const b = im[i]; im[i] = im[j]; im[j] = b }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const step = n / len
    for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
      const wr = cos[k * step], wi = -sin[k * step], a = i + k, b = a + len / 2
      const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr
      re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi
    }
  }
}

const mono = (buf: AudioLike, n: number) => {
  const out = new Float32Array(n), cn = buf.numberOfChannels
  for (let c = 0; c < cn; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / cn }
  return out
}

/** Per-frame features: [rms dB, low / mid / high band log energy, log centroid] and spectral flux (for pinning a boundary to an onset). */
function frames(x: Float32Array, rate: number) {
  const size = 2 ** Math.round(Math.log2(Math.max(256, rate * E.sectionFrameSec))), hop = size / 2, count = Math.max(0, Math.floor((x.length - size) / hop) + 1)
  const cos = new Float64Array(size / 2), sin = new Float64Array(size / 2), win = new Float64Array(size)
  for (let i = 0; i < size / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / size); sin[i] = Math.sin(2 * Math.PI * i / size) }
  for (let i = 0; i < size; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size)
  const [e1, e2] = E.sectionBands, k1 = Math.round(e1 * size / rate), k2 = Math.round(e2 * size / rate), half = size / 2
  const re = new Float64Array(size), im = new Float64Array(size), prev = new Float64Array(half)
  const feat: number[][] = [], flux = new Float64Array(count)
  for (let f = 0; f < count; f++) {
    let sq = 0
    for (let i = 0; i < size; i++) { const v = x[f * hop + i]; sq += v * v; re[i] = v * win[i]; im[i] = 0 }
    fft(re, im, cos, sin)
    let lo = 0, mid = 0, hi = 0, num = 0, den = 0, fl = 0
    for (let k = 1; k < half; k++) {
      const m = Math.hypot(re[k], im[k]), e = m * m
      if (k < k1) lo += e; else if (k < k2) mid += e; else hi += e
      num += k * m; den += m
      const c = Math.log1p(m * 20); fl += Math.max(0, c - prev[k]); prev[k] = c
    }
    const L = (v: number) => Math.log10(v + 1e-9)
    feat.push([10 * Math.log10(sq / size + 1e-10), L(lo), L(mid), L(hi), Math.log2(1 + (den > 0 ? num / den : 0))])
    flux[f] = f ? fl : 0
  }
  return { feat, flux, hop }
}

/** Boundaries between musically different parts (verse / chorus / drop). Method: short-time features (loudness, low/mid/high band
 *  energy, spectral centroid) averaged into 0.5s bins, a self-similarity matrix, then Foote's checkerboard kernel slid along the
 *  diagonal gives a novelty curve; peaks above a sensitivity-scaled threshold at least minSec apart are the boundaries,
 *  each pinned to the nearest spectral-flux onset. Time in source seconds, sorted by t. `sensitivity` 0..1 (higher = more). */
export function detectSections(buf: AudioLike, opts: { minSec?: number; sensitivity?: number } = {}): Section[] {
  const rate = buf.sampleRate, minSec = opts.minSec ?? E.sectionMinSec, sens = Math.min(0.99, Math.max(0.01, opts.sensitivity ?? E.sectionSensitivity))
  const n = Math.min(buf.getChannelData(0).length, Math.floor(E.sectionMaxSec * rate))
  const { feat, flux, hop } = frames(mono(buf, n), rate)
  const perBin = Math.max(1, Math.round(E.sectionBinSec * rate / hop)), binSec = perBin * hop / rate, bins = Math.floor(feat.length / perBin)
  const dim = 5, F: number[][] = []
  for (let b = 0; b < bins; b++) {
    const v = new Array(dim).fill(0)
    for (let f = b * perBin; f < (b + 1) * perBin; f++) for (let d = 0; d < dim; d++) v[d] += feat[f][d] / perBin
    F.push(v)
  }
  const L = Math.round(E.sectionKernelSec / binSec)
  if (bins < 6) return []
  for (let d = 0; d < dim; d++) {   // z-score each feature so loudness and brightness count equally
    const m = F.reduce((s, v) => s + v[d], 0) / bins, sd = Math.max(E.sectionFloor[d], Math.sqrt(F.reduce((s, v) => s + (v[d] - m) ** 2, 0) / bins))
    for (const v of F) v[d] = (v[d] - m) / sd
  }
  const sim = (a: number, b: number) => { let d2 = 0; for (let d = 0; d < dim; d++) d2 += (F[a][d] - F[b][d]) ** 2; return Math.exp(-d2 / (2 * dim)) }
  const nov = new Float64Array(bins), minL = Math.max(3, Math.round(E.sectionEdgeSec / binSec))
  for (let i = minL; i <= bins - minL; i++) {   // boundary between bin i-1 and bin i; the kernel shrinks near the file's edges
    const l = Math.min(L, i, bins - i); let within = 0, cross = 0
    for (let a = 1; a <= l; a++) for (let b = 1; b <= l; b++) {
      within += sim(i - a, i - b) + sim(i + a - 1, i + b - 1); cross += 2 * sim(i - a, i + b - 1)
    }
    nov[i] = (within - cross) / (2 * l * l)
  }
  const mean = nov.reduce((s, v) => s + v, 0) / bins, std = Math.sqrt(nov.reduce((s, v) => s + (v - mean) ** 2, 0) / bins)
  const thr = Math.max(E.sectionMinNovelty, mean + E.sectionThreshold * (1 - sens) * std)
  const cand: number[] = []
  for (let i = 1; i < bins - 1; i++) if (nov[i] > thr && nov[i] >= nov[i - 1] && nov[i] > nov[i + 1]) cand.push(i)
  cand.sort((a, b) => nov[b] - nov[a])
  const kept: number[] = []
  for (const i of cand) if (kept.every((j) => Math.abs(i - j) * binSec >= minSec)) kept.push(i)
  const top = Math.max(1e-9, ...kept.map((i) => nov[i])), span = Math.round(binSec * rate / hop)
  return kept.map((i) => {
    const centre = Math.round(i * perBin), a = Math.max(1, centre - span), z = Math.min(flux.length - 1, centre + span)
    let best = Math.min(centre, flux.length - 1)
    for (let f = a; f <= z; f++) if (flux[f] > flux[best]) best = f
    return { t: best * hop / rate, strength: Math.min(1, nov[i] / top) }
  }).sort((a, b) => a.t - b.t)
}

/** Stretches quieter than thresholdDb (RMS of the loudest channel in 5ms windows) lasting at least minSec. Source seconds. */
export function detectSilence(buf: AudioLike, thresholdDb: number, minSec: number): { start: number; end: number }[] {
  const rate = buf.sampleRate, win = Math.max(1, Math.round(E.silenceWinSec * rate)), chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  const len = chs[0]?.length ?? 0, lin2 = 10 ** (thresholdDb / 10), out: { start: number; end: number }[] = []
  let from = -1
  const close = (to: number) => { if (from >= 0 && (to - from) / rate >= minSec) out.push({ start: from / rate, end: to / rate }); from = -1 }
  for (let a = 0; a < len; a += win) {
    const z = Math.min(len, a + win); let loud = 0
    for (const c of chs) { let s = 0; for (let i = a; i < z; i++) s += c[i] * c[i]; loud = Math.max(loud, s / (z - a)) }
    if (loud < lin2) { if (from < 0) from = a } else close(a)
  }
  close(len)
  return out
}

/** The AUDIBLE span of a file: `start` = first sample louder than thresholdDb, `end` = just after the last one (source seconds).
 *  Everything before start / after end is leading / trailing silence. All silent: { start: 0, end: 0 }. */
export function leadingTrailingSilence(buf: AudioLike, thresholdDb: number): { start: number; end: number } {
  const lin = 10 ** (thresholdDb / 20), chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), len = chs[0]?.length ?? 0
  const loud = (i: number) => chs.some((c) => Math.abs(c[i]) > lin)
  let a = 0, z = len - 1
  while (a < len && !loud(a)) a++
  if (a >= len) return { start: 0, end: 0 }
  while (z > a && !loud(z)) z--
  return { start: a / buf.sampleRate, end: (z + 1) / buf.sampleRate }
}

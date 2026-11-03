import { EDITOR_AUDIO } from '../config/editorAudio'

export type PeakLevel = { spp: number; min: Float32Array; max: Float32Array }
export type Peaks = { rate: number; levels: PeakLevel[] }

/** Pure: min/max per bucket across ALL channels. Level 0 is read from samples, later levels are folded from the
 *  previous level (exact, because every spp is a multiple of the one before). */
export function peaksFromChannels(channels: Float32Array[], rate: number, spps: number[] = EDITOR_AUDIO.peakLevels): Peaks {
  const n = channels[0]?.length ?? 0, levels: PeakLevel[] = []
  for (const spp of spps) {
    const count = Math.ceil(n / spp), min = new Float32Array(count), max = new Float32Array(count)
    const prev = levels[levels.length - 1]
    if (!prev) {
      for (let i = 0; i < count; i++) {
        let lo = Infinity, hi = -Infinity
        const end = Math.min(n, (i + 1) * spp)
        for (const ch of channels) for (let s = i * spp; s < end; s++) { const v = ch[s]; if (v < lo) lo = v; if (v > hi) hi = v }
        min[i] = lo; max[i] = hi
      }
    } else {
      const r = spp / prev.spp
      for (let i = 0; i < count; i++) {
        let lo = Infinity, hi = -Infinity
        const end = Math.min(prev.min.length, (i + 1) * r)
        for (let s = i * r; s < end; s++) { if (prev.min[s] < lo) lo = prev.min[s]; if (prev.max[s] > hi) hi = prev.max[s] }
        min[i] = lo; max[i] = hi
      }
    }
    levels.push({ spp, min, max })
  }
  return { rate, levels }
}

export function computePeaks(buf: AudioBuffer): Peaks {
  return peaksFromChannels(Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c)), buf.sampleRate)
}

/** The coarsest level that still has at least one bucket per pixel of detail (spp <= samples per pixel). */
export function pickLevel(pk: Peaks, secPerPx: number): PeakLevel {
  const want = secPerPx * pk.rate
  let best = pk.levels[0]
  for (const l of pk.levels) if (l.spp <= want) best = l
  return best
}

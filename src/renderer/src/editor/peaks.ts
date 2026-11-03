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

// ---- on-disk cache (userData/peaks via IPC) ----
const MAGIC = 0x4b505653   // 'SVPK'
const FORMAT = 1

/** Pure: stable, filename-safe cache key. The path is hashed (cyrb53); mtime and size make an edited/replaced file miss. */
export function peaksKey(path: string, mtimeMs: number, size: number): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57
  for (let i = 0; i < path.length; i++) { const c = path.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677) }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}-${Math.round(mtimeMs)}-${size}-v${FORMAT}`
}

/** Pure: Peaks -> bytes. Layout (little endian, all 4-byte words): magic, format, rate(f32), nLevels, then per level
 *  [spp, count], then per level the min floats followed by the max floats. */
export function serialisePeaks(pk: Peaks): ArrayBuffer {
  const words = 4 + pk.levels.length * 2, floats = pk.levels.reduce((n, l) => n + l.min.length * 2, 0)
  const buf = new ArrayBuffer((words + floats) * 4), v = new DataView(buf)
  v.setUint32(0, MAGIC, true); v.setUint32(4, FORMAT, true); v.setFloat32(8, pk.rate, true); v.setUint32(12, pk.levels.length, true)
  pk.levels.forEach((l, i) => { v.setUint32(16 + i * 8, l.spp, true); v.setUint32(20 + i * 8, l.min.length, true) })
  let o = words * 4
  for (const l of pk.levels) {
    new Float32Array(buf, o, l.min.length).set(l.min); o += l.min.length * 4
    new Float32Array(buf, o, l.max.length).set(l.max); o += l.max.length * 4
  }
  return buf
}

/** Pure: bytes -> Peaks, or null for anything unrecognised or truncated (callers treat null as a cache miss). Copies, never views. */
export function deserialisePeaks(data: ArrayBuffer | ArrayBufferView | null | undefined): Peaks | null {
  if (!data) return null
  const src = ArrayBuffer.isView(data) ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer : data
  if (src.byteLength < 16) return null
  const v = new DataView(src)
  if (v.getUint32(0, true) !== MAGIC || v.getUint32(4, true) !== FORMAT) return null
  const rate = v.getFloat32(8, true), n = v.getUint32(12, true)
  if (n > 16 || src.byteLength < 16 + n * 8) return null
  const meta = Array.from({ length: n }, (_, i) => ({ spp: v.getUint32(16 + i * 8, true), count: v.getUint32(20 + i * 8, true) }))
  let o = 16 + n * 8
  if (src.byteLength !== o + meta.reduce((s, m) => s + m.count * 8, 0)) return null
  const levels: PeakLevel[] = meta.map(({ spp, count }) => {
    const min = new Float32Array(src.slice(o, o + count * 4)); o += count * 4
    const max = new Float32Array(src.slice(o, o + count * 4)); o += count * 4
    return { spp, min, max }
  })
  return { rate, levels }
}

export type PeaksApi = {
  peaksStat(path: string): Promise<{ mtimeMs: number; size: number } | null>
  peaksGet(key: string): Promise<ArrayBuffer | Uint8Array | null>
  peaksPut(key: string, data: ArrayBuffer): Promise<void>
}
/** Peaks for a file, from the disk cache when possible. A HIT never calls `decode` (so the waveform shows without decoding the audio;
 *  the caller decodes the buffer lazily on play). A miss decodes once, computes, stores, and returns the decoded buffer too.
 *  Any cache failure degrades to a miss. */
export async function cachedPeaks(path: string, decode: () => Promise<AudioBuffer>, api: PeaksApi = window.api): Promise<{ peaks: Peaks; hit: boolean; buffer?: AudioBuffer }> {
  let key: string | null = null
  try {
    const st = await api.peaksStat(path)
    if (st) {
      key = peaksKey(path, st.mtimeMs, st.size)
      const pk = deserialisePeaks(await api.peaksGet(key))
      if (pk) return { peaks: pk, hit: true }
    }
  } catch { key = key ?? null }
  const buffer = await decode(), peaks = computePeaks(buffer)
  if (key) api.peaksPut(key, serialisePeaks(peaks)).catch(() => { /* cache is best effort */ })
  return { peaks, hit: false, buffer }
}

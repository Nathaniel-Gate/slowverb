export type BitDepth = 16 | 24 | 32

/** AudioBuffer-like channels -> WAV bytes. 16 and 24 bit are integer PCM (format 1); 32 is IEEE float (format 3, with the
 *  fact chunk the spec requires for non-PCM). Samples outside -1..1 clamp for the integer depths. Pure, tested. */
export function encodeWav(channels: Float32Array[], rate: number, bitDepth: BitDepth = 16): ArrayBuffer {
  const n = channels[0].length, ch = channels.length, bps = bitDepth / 8, bytes = n * ch * bps, float = bitDepth === 32
  const fmtSize = float ? 18 : 16, factSize = float ? 12 : 0, head = 12 + 8 + fmtSize + factSize + 8
  const pad = bytes & 1                                  // RIFF chunks are word aligned (24-bit mono with odd n)
  const buf = new ArrayBuffer(head + bytes + pad), v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, buf.byteLength - 8, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, fmtSize, true); v.setUint16(20, float ? 3 : 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * bps, true); v.setUint16(32, ch * bps, true); v.setUint16(34, bitDepth, true)
  let o = 36
  if (float) { v.setUint16(o, 0, true); o += 2; str(o, 'fact'); v.setUint32(o + 4, 4, true); v.setUint32(o + 8, n, true); o += 12 }
  str(o, 'data'); v.setUint32(o + 4, bytes, true); o += 8
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const x = channels[c][i]
    if (float) { v.setFloat32(o, x, true); o += 4; continue }
    const s = Math.max(-1, Math.min(1, x))
    if (bitDepth === 16) { v.setInt16(o, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true); o += 2 }
    else { const q = Math.round(s < 0 ? s * 0x800000 : s * 0x7fffff); v.setUint8(o, q & 255); v.setUint8(o + 1, (q >> 8) & 255); v.setUint8(o + 2, (q >> 16) & 255); o += 3 }
  }
  return buf
}

/** Parsed header, for tests and the harness proof (not used by the app). Throws on anything malformed. */
export function readWavHeader(b: ArrayBuffer) {
  const v = new DataView(b), tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('not RIFF/WAVE')
  let o = 12, fmt: { format: number; channels: number; rate: number; byteRate: number; blockAlign: number; bits: number } | null = null, fact: number | null = null
  while (o + 8 <= b.byteLength) {
    const id = tag(o), size = v.getUint32(o + 4, true)
    if (id === 'fmt ') fmt = { format: v.getUint16(o + 8, true), channels: v.getUint16(o + 10, true), rate: v.getUint32(o + 12, true), byteRate: v.getUint32(o + 16, true), blockAlign: v.getUint16(o + 20, true), bits: v.getUint16(o + 22, true) }
    if (id === 'fact') fact = v.getUint32(o + 8, true)
    if (id === 'data') {
      if (!fmt) throw new Error('data before fmt')
      return { ...fmt, fact, riffSize: v.getUint32(4, true), dataOffset: o + 8, dataBytes: size, frames: size / fmt.blockAlign, fileBytes: b.byteLength }
    }
    o += 8 + size + (size & 1)
  }
  throw new Error('no data chunk')
}

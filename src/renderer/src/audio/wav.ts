/** AudioBuffer-like channels -> 16-bit PCM WAV bytes. Pure, tested. */
export function encodeWav(channels: Float32Array[], rate: number): ArrayBuffer {
  const n = channels[0].length, ch = channels.length, bytes = n * ch * 2
  const buf = new ArrayBuffer(44 + bytes), v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF'); v.setUint32(4, 36 + bytes, true); str(8, 'WAVE'); str(12, 'fmt ')
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true)
  v.setUint32(24, rate, true); v.setUint32(28, rate * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true)
  str(36, 'data'); v.setUint32(40, bytes, true)
  let o = 44
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const s = Math.max(-1, Math.min(1, channels[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2
  }
  return buf
}

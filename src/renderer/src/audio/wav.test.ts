import { describe, expect, it } from 'vitest'
import { encodeWav, readWavHeader } from './wav'

it('writes a valid stereo 16-bit header and clamps samples', () => {
  const b = encodeWav([new Float32Array([0, 1, -1, 2]), new Float32Array([0, 0.5, -0.5, -2])], 44100), v = new DataView(b)
  expect(b.byteLength).toBe(44 + 4 * 2 * 2)
  expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF')
  expect(v.getUint16(22, true)).toBe(2); expect(v.getUint32(24, true)).toBe(44100)
  expect(v.getInt16(44 + 4, true)).toBe(32767)      // ch0 sample 1 = 1.0
  expect(v.getInt16(44 + 8, true)).toBe(-32768)     // ch0 sample 2 = -1.0
  expect(v.getInt16(44 + 14, true)).toBe(-32768)    // ch1 sample 3 clamps -2 -> -1
})

const sig = [new Float32Array([0, 1, -1, 0.5, -0.25, 2]), new Float32Array([0.1, -0.1, 0.75, -1, 0, -2])]
describe('bit depths', () => {
  it('24-bit PCM: header, 3 bytes per sample, values and clamping', () => {
    const b = encodeWav(sig, 48000, 24), h = readWavHeader(b), v = new DataView(b)
    expect(h).toMatchObject({ format: 1, channels: 2, rate: 48000, bits: 24, blockAlign: 6, byteRate: 48000 * 6, dataBytes: 6 * 6, frames: 6, dataOffset: 44, fact: null })
    expect(h.riffSize).toBe(b.byteLength - 8)
    const s24 = (i: number) => { const o = 44 + i * 3; return ((v.getInt8(o + 2) << 16) | (v.getUint8(o + 1) << 8) | v.getUint8(o)) }
    expect(s24(2)).toBe(0x7fffff)                    // ch0 frame 1 = +1.0
    expect(s24(4)).toBe(-0x800000)                   // ch0 frame 2 = -1.0
    expect(s24(6)).toBe(Math.round(0.5 * 0x7fffff)) // ch0 frame 3
    expect(s24(10)).toBe(0x7fffff)                   // ch0 frame 5 clamps +2
    expect(s24(11)).toBe(-0x800000)                  // ch1 frame 5 clamps -2
  })
  it('24-bit mono with an odd byte count is padded to a word boundary and riff size still matches', () => {
    const b = encodeWav([new Float32Array([0.1, 0.2, 0.3])], 44100, 24), h = readWavHeader(b)
    expect(h.dataBytes).toBe(9); expect(b.byteLength % 2).toBe(0); expect(h.riffSize).toBe(b.byteLength - 8)
  })
  it('32-bit float: format 3, fact chunk, exact samples (no clamping)', () => {
    const b = encodeWav(sig, 44100, 32), h = readWavHeader(b), v = new DataView(b)
    expect(h).toMatchObject({ format: 3, channels: 2, bits: 32, blockAlign: 8, byteRate: 44100 * 8, dataBytes: 6 * 8, frames: 6, fact: 6 })
    expect(h.riffSize).toBe(b.byteLength - 8)
    expect(v.getFloat32(h.dataOffset + 5 * 8, true)).toBe(2)           // over-range kept as float
    expect(v.getFloat32(h.dataOffset + 5 * 8 + 4, true)).toBe(-2)
    expect(v.getFloat32(h.dataOffset + 1 * 8 + 4, true)).toBeCloseTo(-0.1, 6)
  })
  it('every depth reports consistent length', () => {
    for (const d of [16, 24, 32] as const) { const h = readWavHeader(encodeWav(sig, 44100, d)); expect(h.frames).toBe(6); expect(h.dataOffset + h.dataBytes).toBeLessThanOrEqual(h.fileBytes) }
  })
  it('readWavHeader rejects garbage', () => { expect(() => readWavHeader(new ArrayBuffer(20))).toThrow() })
})

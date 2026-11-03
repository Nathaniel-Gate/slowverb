import { expect, it } from 'vitest'
import { encodeWav } from './wav'
it('writes a valid stereo 16-bit header and clamps samples', () => {
  const b = encodeWav([new Float32Array([0, 1, -1, 2]), new Float32Array([0, 0.5, -0.5, -2])], 44100), v = new DataView(b)
  expect(b.byteLength).toBe(44 + 4 * 2 * 2)
  expect(String.fromCharCode(v.getUint8(0), v.getUint8(1), v.getUint8(2), v.getUint8(3))).toBe('RIFF')
  expect(v.getUint16(22, true)).toBe(2); expect(v.getUint32(24, true)).toBe(44100)
  expect(v.getInt16(44 + 4, true)).toBe(32767)      // ch0 sample 1 = 1.0
  expect(v.getInt16(44 + 8, true)).toBe(-32768)     // ch0 sample 2 = -1.0
  expect(v.getInt16(44 + 14, true)).toBe(-32768)    // ch1 sample 3 clamps -2 -> -1
})

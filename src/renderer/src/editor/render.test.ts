import { expect, it } from 'vitest'
import { normalizeChannels } from './render'

it('normalizeChannels scales the loudest sample (any channel) to the target dBFS', () => {
  const ch = [new Float32Array([0.1, -0.25, 0.05]), new Float32Array([0.2, 0.5, -0.4])]
  const g = normalizeChannels(ch, -6.0206)   // 0.5 -> 0.5 is already -6.02 dB, so gain ~1
  expect(g).toBeCloseTo(1, 3)
  const q = [new Float32Array([0.1, -0.25]), new Float32Array([0.05, 0.2])]
  normalizeChannels(q, -1)
  expect(Math.max(...q.flatMap((c) => Array.from(c, Math.abs)))).toBeCloseTo(10 ** (-1 / 20), 6)
  expect(q[0][0] / q[0][1]).toBeCloseTo(-0.4, 6)   // balance untouched
})
it('silence is left alone (gain 1, no NaN)', () => {
  const s = [new Float32Array(10)]; expect(normalizeChannels(s)).toBe(1); expect(Array.from(s[0]).every((v) => v === 0)).toBe(true)
})

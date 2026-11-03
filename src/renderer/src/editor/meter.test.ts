import { expect, it } from 'vitest'
import { newMeterState, stepMeter } from './meter'

const run = (steps: { l: number; r?: number; dt: number }[]) => {
  let s = newMeterState(), now = 100, read = stepMeter(s, { l: 0, r: 0 }, now, 0).read
  for (const st of steps) { now += st.dt; const o = stepMeter(s, { l: st.l, r: st.r ?? st.l }, now, st.dt); s = o.state; read = o.read }
  return read
}
it('attacks instantly and reports both channels separately', () => {
  const r = run([{ l: 0.5, r: 0.1, dt: 0.016 }]); expect(r.l).toBe(0.5); expect(r.r).toBe(0.1); expect(r.peakL).toBe(0.5)
})
it('falls at 30 dB/s: 1 s of silence after 1.0 leaves -30 dB (0.0316)', () => {
  const r = run([{ l: 1, dt: 0.016 }, ...Array.from({ length: 50 }, () => ({ l: 0, dt: 0.02 }))])
  expect(r.l).toBeCloseTo(10 ** (-30 / 20), 3)
})
it('peak hold stays for the hold time, then falls', () => {
  const held = run([{ l: 0.8, dt: 0.016 }, ...Array.from({ length: 30 }, () => ({ l: 0, dt: 0.02 }))])   // 0.6 s later
  expect(held.peakL).toBe(0.8); expect(held.l).toBeLessThan(0.8)
  const fell = run([{ l: 0.8, dt: 0.016 }, ...Array.from({ length: 120 }, () => ({ l: 0, dt: 0.02 }))])   // 2.4 s later
  expect(fell.peakL).toBeLessThan(0.8)
})
it('clip flag lights at full scale and clears after the hold time; values are capped at 1', () => {
  const lit = run([{ l: 1.4, dt: 0.016 }]); expect(lit.clip).toBe(true); expect(lit.l).toBe(1); expect(lit.peakL).toBe(1)
  expect(run([{ l: 0.99, dt: 0.016 }]).clip).toBe(false)
  expect(run([{ l: 1, dt: 0.016 }, ...Array.from({ length: 200 }, () => ({ l: 0, dt: 0.02 }))]).clip).toBe(false)   // 4 s later
})
it('a louder sample after a hold replaces the peak', () => {
  const r = run([{ l: 0.4, dt: 0.016 }, { l: 0.9, dt: 0.016 }]); expect(r.peakL).toBe(0.9)
})

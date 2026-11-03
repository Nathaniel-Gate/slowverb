import { expect, it } from 'vitest'
import { peaksFromChannels, pickLevel } from './peaks'

const ramp = (n: number) => Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.37) * (1 - i / n))

it('level 0 equals a brute-force min/max per bucket, across channels', () => {
  const a = ramp(1000), b = ramp(1000).map((v) => -v * 0.5)
  const pk = peaksFromChannels([a, b], 44100, [64])
  const l = pk.levels[0]
  expect(l.min.length).toBe(Math.ceil(1000 / 64))
  for (let i = 0; i < l.min.length; i++) {
    const s = [...a.slice(i * 64, i * 64 + 64), ...b.slice(i * 64, i * 64 + 64)]
    expect(l.min[i]).toBe(Math.min(...s)); expect(l.max[i]).toBe(Math.max(...s))
  }
})
it('coarser levels folded from finer ones equal a direct computation (incl. the partial last bucket)', () => {
  const x = ramp(70001), folded = peaksFromChannels([x], 48000, [64, 256, 1024, 4096])
  for (const spp of [256, 1024, 4096]) {
    const direct = peaksFromChannels([x], 48000, [spp]).levels[0], f = folded.levels.find((l) => l.spp === spp)!
    expect(Array.from(f.min)).toEqual(Array.from(direct.min)); expect(Array.from(f.max)).toEqual(Array.from(direct.max))
  }
})
it('a full-scale sample survives to every level', () => {
  const x = new Float32Array(10000); x[5000] = 1; x[7000] = -1
  for (const l of peaksFromChannels([x], 44100).levels) { expect(Math.max(...l.max)).toBe(1); expect(Math.min(...l.min)).toBe(-1) }
})
it('pickLevel chooses the coarsest level not coarser than a pixel', () => {
  const pk = peaksFromChannels([new Float32Array(100000)], 1000, [64, 256, 1024, 4096])
  expect(pickLevel(pk, 0.001).spp).toBe(64)    // 1 sample per px -> finest
  expect(pickLevel(pk, 0.3).spp).toBe(256)     // 300 samples per px
  expect(pickLevel(pk, 1.1).spp).toBe(1024)    // 1100 samples per px
  expect(pickLevel(pk, 100).spp).toBe(4096)
})
it('empty audio gives empty levels, not a crash', () => {
  expect(peaksFromChannels([new Float32Array(0)], 44100).levels[0].min.length).toBe(0)
})

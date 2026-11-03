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

import { cachedPeaks, deserialisePeaks, peaksKey, serialisePeaks } from './peaks'
const sample = () => peaksFromChannels([ramp(20000), ramp(20000).map((v) => -v)], 44100)

it('serialise -> deserialise round trips every level exactly', () => {
  const pk = sample(), back = deserialisePeaks(serialisePeaks(pk))!
  expect(back.rate).toBe(44100); expect(back.levels.map((l) => l.spp)).toEqual([64, 256, 1024, 4096])
  back.levels.forEach((l, i) => { expect(Array.from(l.min)).toEqual(Array.from(pk.levels[i].min)); expect(Array.from(l.max)).toEqual(Array.from(pk.levels[i].max)) })
})
it('deserialise accepts a typed-array view (what IPC hands back) and rejects bad / truncated / foreign data', () => {
  const bytes = serialisePeaks(sample())
  expect(deserialisePeaks(new Uint8Array(bytes))).not.toBeNull()
  expect(deserialisePeaks(bytes.slice(0, bytes.byteLength - 4))).toBeNull()
  expect(deserialisePeaks(new ArrayBuffer(64))).toBeNull(); expect(deserialisePeaks(null)).toBeNull()
})
it('peaksKey is deterministic, filename safe, and changes with path, mtime or size', () => {
  const k = peaksKey('/a/b.m4a', 1700000000000.5, 123)
  expect(k).toBe(peaksKey('/a/b.m4a', 1700000000000.5, 123)); expect(k).toMatch(/^[0-9a-f]{16}-\d+-\d+-v\d+$/)
  for (const o of [peaksKey('/a/c.m4a', 1700000000000.5, 123), peaksKey('/a/b.m4a', 1700000000002, 123), peaksKey('/a/b.m4a', 1700000000000.5, 124)]) expect(o).not.toBe(k)
})
it('cachedPeaks: a hit skips decode; a miss decodes once and stores; broken cache falls back to decode', async () => {
  const store = new Map<string, ArrayBuffer>()
  const api = { peaksStat: async () => ({ mtimeMs: 5, size: 9 }), peaksGet: async (k: string) => store.get(k) ?? null, peaksPut: async (k: string, d: ArrayBuffer) => { store.set(k, d) } }
  let decodes = 0
  const buf = { numberOfChannels: 1, sampleRate: 44100, length: 5000, getChannelData: () => ramp(5000) } as unknown as AudioBuffer
  const decode = async () => { decodes++; return buf }
  const miss = await cachedPeaks('/x.m4a', decode, api)
  expect(miss.hit).toBe(false); expect(decodes).toBe(1); expect(miss.buffer).toBe(buf); expect(store.size).toBe(1)
  const hit = await cachedPeaks('/x.m4a', decode, api)
  expect(hit.hit).toBe(true); expect(decodes).toBe(1); expect(hit.buffer).toBeUndefined()
  expect(Array.from(hit.peaks.levels[0].max)).toEqual(Array.from(miss.peaks.levels[0].max))
  const broken = { ...api, peaksGet: async () => { throw new Error('ipc down') } }
  expect((await cachedPeaks('/x.m4a', decode, broken)).hit).toBe(false); expect(decodes).toBe(2)
  const changed = { ...api, peaksStat: async () => ({ mtimeMs: 6, size: 9 }) }
  expect((await cachedPeaks('/x.m4a', decode, changed)).hit).toBe(false)   // edited file: new key, miss
})

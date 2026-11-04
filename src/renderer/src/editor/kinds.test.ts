import { describe, expect, it } from 'vitest'
import { audioOf, FIRST_VISUAL, merge, slice } from './kinds'
import type { Clip, Project } from './model'
import * as ops from './ops'
import { A, mk, proj } from './testkit'

const IMG = '/v/pic.jpg', VID = '/v/clip.mp4'
const vclip = (id: string, track: string, start: number, len: number, src = IMG, extra: Partial<Clip> = {}): Clip => mk(id, track, start, 0, len, src, extra)
/** An audio project (T1..T2) plus two visual tracks V1, V2 with a still and a video. */
function mixed(): Project {
  const p = proj([mk('a1', 'T1', 0, 0, 10), mk('a2', 'T2', 2, 0, 3)], { tracks: 2 })
  return {
    ...p, sources: { ...p.sources, [IMG]: { duration: 3600, kind: 'image' }, [VID]: { duration: 8, kind: 'video' } },
    tracks: [{ ...FIRST_VISUAL }, { ...FIRST_VISUAL, id: 'V2', name: 'V2' }, ...p.tracks],
    clips: [...p.clips, vclip('v1', 'V1', 0, 4), vclip('v2', 'V2', 1, 5, VID)]
  }
}
const audioJson = (p: Project) => JSON.stringify({ t: audioOf(p).tracks, c: [...audioOf(p).clips].sort((a, b) => a.id.localeCompare(b.id)) })

describe('kinds: one project, an audio slice and a visual slice', () => {
  it('an audio-only project slices to itself (old edits behave exactly as before)', () => {
    const p = proj([mk('a', 'T1', 0, 0, 5)])
    expect(slice(p, 'audio')).toBe(p)
    const next = ops.splitAt(p, 2)
    expect(merge(p, next, 'audio')).toBe(next)
  })
  it('the visual slice of an audio-only project shows one empty V1 track and saves nothing until edited', () => {
    const p = proj([mk('a', 'T1', 0, 0, 5)]), v = slice(p, 'visual')
    expect(v.tracks.map((t) => t.id)).toEqual(['V1']); expect(v.clips).toEqual([])
    expect(merge(p, v, 'visual')).toBe(p)
    const edited = merge(p, ops.addMarker(v, 1), 'visual')
    expect(edited.tracks.map((t) => t.id)).toEqual(['V1', 'T1', 'T2', 'T3']); expect(edited.markers.length).toBe(1)
    expect(ops.validate(edited)).toEqual([])
  })
  it('slices split tracks, clips and sources by kind and are memoised', () => {
    const p = mixed(), a = slice(p, 'audio'), v = slice(p, 'visual')
    expect(a.tracks.map((t) => t.id)).toEqual(['T1', 'T2']); expect(a.clips.map((c) => c.id)).toEqual(['a1', 'a2'])
    expect(Object.keys(a.sources).some((k) => k === IMG)).toBe(false)
    expect(v.tracks.map((t) => t.id)).toEqual(['V1', 'V2']); expect(v.clips.map((c) => c.id)).toEqual(['v1', 'v2'])
    expect(slice(p, 'visual')).toBe(v); expect(merge(p, v, 'visual')).toBe(p)
  })
  it('editing the visual slice never touches audio (split all, ripple with sync lock, new track, remove last track)', () => {
    const p = mixed(), v = slice(p, 'visual')
    const steps = [
      (q: Project) => ops.splitAt(q, 2),
      (q: Project) => ops.rippleDelete(q, [q.clips[0].id]),
      (q: Project) => ops.addTrack(q),
      (q: Project) => ops.removeTrack(q, 'V2'), (q: Project) => ops.removeTrack(q, 'V1'),
    ]
    let cur = p
    for (const f of steps) { cur = merge(cur, f(slice(cur, 'visual')), 'visual'); expect(ops.validate(cur)).toEqual([]); expect(audioJson(cur)).toBe(audioJson(p)) }
    expect(cur.tracks.filter((t) => t.kind === 'visual').length).toBeGreaterThan(0)   // the last visual track is never removed
    expect(slice(cur, 'visual').tracks.some((t) => /^V\d+$/.test(t.id))).toBe(true)
    expect(v.tracks.length).toBe(2)
  })
  it('a new track in the Clips tab is visual and named V<n>; in the Editor tab it stays audio', () => {
    const p = mixed()
    const vNew = ops.addTrack(slice(p, 'visual')).tracks.at(-1)!
    expect(vNew).toMatchObject({ id: 'V3', kind: 'visual' })
    const aNew = ops.addTrack(slice(p, 'audio')).tracks.at(-1)!
    expect(aNew.kind).toBeUndefined(); expect(aNew.id.startsWith('A')).toBe(true)
  })
  it('editing the audio slice keeps every picture where it was', () => {
    const p = mixed(), before = JSON.stringify(slice(p, 'visual').clips)
    const next = merge(p, ops.rippleDelete(slice(p, 'audio'), ['a2']), 'audio')
    expect(JSON.stringify(slice(next, 'visual').clips)).toBe(before)
    expect(ops.validate(next)).toEqual([])
  })
  it('validate catches a picture on an audio track', () => {
    const p = mixed(), bad = { ...p, clips: p.clips.map((c) => (c.id === 'v1' ? { ...c, track: 'T1', start: 20 } : c)) }
    expect(ops.validate(bad).some((m) => m.includes('picture on an audio track'))).toBe(true)
  })
})

// Random op sequences on alternating slices: the merged project is always valid and the side NOT being edited never changes.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)
describe('kinds fuzz', () => {
  for (let seed = 1; seed <= 30; seed++) it(`seed ${seed}`, () => {
    const r = rng(seed), pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)]
    let p = mixed()
    for (let i = 0; i < 40; i++) {
      const kind = r() < 0.5 ? 'visual' : 'audio', s = slice(p, kind), other = slice(p, kind === 'visual' ? 'audio' : 'visual')
      const ids = s.clips.filter(() => r() < 0.4).map((c) => c.id), t = r() * 12
      const op = Math.floor(r() * 7)
      const next = op === 0 ? ops.splitAt(s, t) : op === 1 ? ops.rippleDelete(s, ids) : op === 2 ? ops.moveClips(s, ids, r() * 4 - 2, pick([0, 1, -1]))
        : op === 3 ? ops.addTrack(s) : op === 4 ? ops.removeTrack(s, pick(s.tracks).id) : op === 5 ? ops.duplicateClips(s, ids, r() * 3) : ops.addMarker(s, t)
      const q = merge(p, next, kind)
      expect(ops.validate(q)).toEqual([])
      expect(JSON.stringify(slice(q, kind === 'visual' ? 'audio' : 'visual').clips.map((c) => c.id).sort())).toBe(JSON.stringify(other.clips.map((c) => c.id).sort()))
      p = q
    }
    expect(p.tracks.some((t) => t.kind === 'visual')).toBe(true); expect(p.tracks.some((t) => t.kind !== 'visual')).toBe(true)
    expect(p.clips.every((c) => (p.tracks.find((t) => t.id === c.track)?.kind === 'visual') === (c.src !== A && !!p.sources[c.src]?.kind))).toBe(true)
  })
})

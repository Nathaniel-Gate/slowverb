import { describe, expect, it } from 'vitest'
import { FIRST_VISUAL } from '../editor/kinds'
import type { Clip, Project } from '../editor/model'
import * as ops from '../editor/ops'
import { clipAlpha, fitRect, layersAt, paint, stageSize, type Layer } from './compose'

const IMG = '/v/a.png', IMG2 = '/v/b.png', VID = '/v/c.mp4'
const vc = (id: string, track: string, start: number, len: number, extra: Partial<Clip> = {}, src = IMG): Clip =>
  ({ id, src, track, start, srcIn: 0, srcOut: len, gain: 1, fadeIn: 0, fadeOut: 0, ...extra })
function proj(clips: Clip[], tracks = 2): Project {
  return {
    version: 1, id: 'p', name: 'T', song: '/s.wav', bpm: null, master: null, markers: [],
    sources: { '/s.wav': { duration: 10 }, [IMG]: { duration: 3600, kind: 'image' }, [IMG2]: { duration: 3600, kind: 'image' }, [VID]: { duration: 8, kind: 'video' } },
    tracks: [...Array.from({ length: tracks }, (_, i) => ({ ...FIRST_VISUAL, id: `V${i + 1}`, name: `V${i + 1}` })), { id: 'A1', name: 'A1', mute: false, solo: false, lock: false, gain: 1 }],
    clips: [...clips, { id: 'aud', src: '/s.wav', track: 'A1', start: 0, srcIn: 0, srcOut: 10, gain: 1, fadeIn: 0, fadeOut: 0 }]
  }
}
const ids = (ls: Layer[]) => ls.map((l) => l.clip.id)

describe('compositor maths', () => {
  it('shows what is under the playhead, bottom track first, audio never', () => {
    const p = proj([vc('top', 'V1', 0, 4), vc('bot', 'V2', 1, 4, {}, IMG2)])
    expect(ids(layersAt(p, 0.5))).toEqual(['top'])
    expect(ids(layersAt(p, 2))).toEqual(['bot', 'top'])
    expect(ids(layersAt(p, 4.5))).toEqual(['bot'])
    expect(layersAt(p, 6)).toEqual([])
  })
  it('hide (mute), solo, disabled and track opacity', () => {
    const base = proj([vc('top', 'V1', 0, 4), vc('bot', 'V2', 0, 4, {}, IMG2)])
    const hide = ops.setTrack(base, 'V1', { mute: true }); expect(ids(layersAt(hide, 1))).toEqual(['bot'])
    const solo = ops.setTrack(base, 'V2', { solo: true }); expect(ids(layersAt(solo, 1))).toEqual(['bot'])
    const off = { ...base, clips: base.clips.map((c) => (c.id === 'bot' ? { ...c, disabled: true } : c)) }; expect(ids(layersAt(off, 1))).toEqual(['top'])
    const dim = ops.setTrack(base, 'V1', { gain: 0.5 }); expect(layersAt(dim, 1).find((l) => l.clip.id === 'top')!.alpha).toBeCloseTo(0.5)
  })
  it('gain is opacity (capped at 1), fades ramp it, the opacity line multiplies', () => {
    const c = vc('a', 'V1', 0, 4, { gain: 1.4, fadeIn: 1, fadeOut: 1, fadeInCurve: 'lin', fadeOutCurve: 'lin' })
    expect(clipAlpha(c, 0)).toBeCloseTo(0); expect(clipAlpha(c, 0.5)).toBeCloseTo(0.5); expect(clipAlpha(c, 2)).toBe(1); expect(clipAlpha(c, 3.75)).toBeCloseTo(0.25)
    const e = vc('e', 'V1', 0, 4, { gain: 0.8, env: [{ t: 0, g: 1 }, { t: 4, g: 0 }] })
    expect(clipAlpha(e, 2)).toBeCloseTo(0.4)
  })
  it('a crossfade on one track is a dissolve: outgoing stays solid, incoming fades in over it', () => {
    let p = proj([vc('a', 'V1', 0, 4, { srcIn: 1800, srcOut: 1804 }), vc('b', 'V1', 4, 4, { srcIn: 1800, srcOut: 1804 }, IMG2)], 1)   // stills sit mid-source so both ends have handles
    p = ops.applyCrossfade(p, 'a', 'b', 1)
    expect(ops.validate(p)).toEqual([])
    const a = p.clips.find((c) => c.id === 'a')!, b = p.clips.find((c) => c.id === 'b')!
    const mid = (Math.max(a.start, b.start) + Math.min(a.start + (a.srcOut - a.srcIn), b.start + (b.srcOut - b.srcIn))) / 2
    const ls = layersAt(p, mid)
    expect(ids(ls)).toEqual(['a', 'b'])
    expect(ls[0].alpha).toBe(1)
    expect(ls[1].alpha).toBeGreaterThan(0.2); expect(ls[1].alpha).toBeLessThan(0.95)
  })
  it('zoom pushes in over the clip; video frames follow srcIn and speed', () => {
    const p = proj([vc('z', 'V1', 2, 4, { zoom: 0.2 }), vc('v', 'V2', 0, 4, { srcIn: 1, srcOut: 7, speed: 1.5 }, VID)])
    const z = layersAt(p, 4).find((l) => l.clip.id === 'z')!; expect(z.scale).toBeCloseTo(1.1)
    const v = layersAt(p, 2).find((l) => l.clip.id === 'v')!; expect(v.srcTime).toBeCloseTo(1 + 2 * 1.5); expect(v.kind).toBe('video')
  })
  it('fits pictures to the stage: cover crops, contain letterboxes, scale zooms around the centre', () => {
    expect(fitRect(200, 100, 160, 90, 'contain')).toEqual({ x: 0, y: 5, w: 160, h: 80 })
    const c = fitRect(200, 100, 160, 90, 'cover'); expect(c.h).toBe(90); expect(c.w).toBe(180); expect(c.x).toBe(-10)
    const z = fitRect(160, 90, 160, 90, 'cover', 2); expect(z).toEqual({ x: -80, y: -45, w: 320, h: 180 })
    expect(stageSize('16:9', 1000, 300)).toEqual({ w: 533, h: 300 }); expect(stageSize('9:16', 1000, 320)).toEqual({ w: 180, h: 320 })
  })
  it('paint draws each ready layer with its opacity over black', () => {
    const calls: string[] = []
    const g = { set globalAlpha(v: number) { calls.push(`a${v}`) }, fillStyle: '', fillRect: () => calls.push('bg'), drawImage: (_e: unknown, x: number, y: number, w: number, h: number) => calls.push(`d${x},${y},${w},${h}`) } as unknown as CanvasRenderingContext2D
    const p = proj([vc('a', 'V1', 0, 4, { gain: 0.5, fit: 'contain' })])
    const n = paint(g, 160, 90, layersAt(p, 1), () => ({ el: {} as CanvasImageSource, w: 320, h: 180 }))
    expect(n).toBe(1); expect(calls).toEqual(['a1', 'bg', 'a0.5', 'd0,0,160,90', 'a1'])
  })
})

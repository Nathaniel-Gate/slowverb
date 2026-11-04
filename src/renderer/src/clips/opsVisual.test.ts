import { describe, expect, it } from 'vitest'
import { CLIPS } from '../config/clips'
import { merge, slice } from '../editor/kinds'
import { clipDur, type Project } from '../editor/model'
import * as ops from '../editor/ops'
import { patchVisual, placeMedia, setAspect, stillLength } from './opsVisual'

const song = '/m/song.wav', IMG = '/v/a.jpg', VID = '/v/b.mp4'
const base = (): Project => ops.newProject(song, 30)

describe('visual ops', () => {
  it('places a still (one bar at the BPM, mid-source handles) and a video (its whole length) on the Clips slice only', () => {
    const full = { ...base(), bpm: 120 }, v = slice(full, 'visual')
    let s = placeMedia(v, IMG, { duration: 1, kind: 'image', w: 800, h: 600 }, 2, 'V1')
    s = placeMedia(s, VID, { duration: 6, kind: 'video' }, 4, 'V1')
    const out = merge(full, s, 'visual')
    expect(ops.validate(out)).toEqual([])
    const still = out.clips.find((c) => c.src === IMG)!, vid = out.clips.find((c) => c.src === VID)!
    expect(still.start).toBe(2); expect(clipDur(still)).toBeCloseTo(2); expect(still.srcIn).toBe(CLIPS.stillInSec)
    expect(out.sources[IMG]).toMatchObject({ kind: 'image', duration: CLIPS.stillSourceSec, w: 800 })
    expect(vid.start).toBe(4); expect(clipDur(vid)).toBeCloseTo(6)
    expect(slice(out, 'audio').clips.length).toBe(1)   // the song is untouched
    expect(stillLength(null)).toBe(CLIPS.stillSec)
  })
  it('insert pushes later pictures right; overwrite trims what is underneath', () => {
    const v = slice(base(), 'visual')
    let s = placeMedia(v, IMG, { duration: 1, kind: 'image' }, 0, 'V1', 'overwrite', 4)
    s = placeMedia(s, VID, { duration: 2, kind: 'video' }, 0, 'V1', 'insert')
    expect(s.clips.map((c) => [c.src, +c.start.toFixed(3)]).sort()).toEqual([[IMG, 2], [VID, 0]])
    const o = placeMedia(slice(base(), 'visual'), IMG, { duration: 1, kind: 'image' }, 0, 'V1', 'overwrite', 4)
    const o2 = placeMedia(o, VID, { duration: 2, kind: 'video' }, 1, 'V1')
    expect(ops.validate(merge(base(), o2, 'visual'))).toEqual([])
    expect(o2.clips.length).toBe(3)   // still split around the video
  })
  it('patches fit, push-in (clamped) and own audio (video only)', () => {
    let s = placeMedia(slice(base(), 'visual'), IMG, { duration: 1, kind: 'image' }, 0, 'V1')
    s = placeMedia(s, VID, { duration: 3, kind: 'video' }, 5, 'V1')
    const ids = s.clips.map((c) => c.id)
    const p = patchVisual(s, ids, { fit: 'contain', zoom: 9, audio: true })
    expect(p.clips.every((c) => c.fit === 'contain' && c.zoom === CLIPS.zoomMax)).toBe(true)
    expect(p.clips.find((c) => c.src === VID)!.audio).toBe(true); expect(p.clips.find((c) => c.src === IMG)!.audio).toBeUndefined()
    expect(patchVisual(p, ids, { fit: 'contain' })).toBe(p)
    const off = patchVisual(p, ids, { zoom: 0, audio: false }); expect(off.clips.every((c) => c.zoom === undefined && c.audio === undefined)).toBe(true)
  })
  it('stores the stage aspect', () => {
    const p = base(); expect(setAspect(p, '16:9')).toBe(p); expect(setAspect(p, '9:16').stage).toEqual({ aspect: '9:16' })
  })
})

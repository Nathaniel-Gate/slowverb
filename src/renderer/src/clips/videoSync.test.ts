import { describe, expect, it } from 'vitest'
import { CLIPS } from '../config/clips'
import type { Clip } from '../editor/model'
import { frameIndex } from './ui/ClipThumbs'
import { drifted, expectedTime, trimmedRate } from './videoPool'
import { frameTimes } from './filmstrip'

const v = (extra: Partial<Clip> = {}): Clip => ({ id: 'v', src: '/v.mp4', track: 'V1', start: 10, srcIn: 2, srcOut: 6, gain: 1, fadeIn: 0, fadeOut: 0, ...extra })

describe('video sync maths', () => {
  it('maps timeline time to the video frame, speed aware and clamped to the clip', () => {
    expect(expectedTime(v(), 11)).toBeCloseTo(3)
    expect(expectedTime(v({ speed: 2 }), 11)).toBeCloseTo(4)
    expect(expectedTime(v(), 5)).toBe(2)                       // before the clip: its first frame (preloading)
    expect(expectedTime(v(), 30)).toBeLessThan(6)              // past the end: held just inside the last frame
  })
  it('small drift is trimmed by rate (no jump), big drift is re-seeked', () => {
    expect(drifted(1, 1.1)).toBe(false); expect(drifted(1, 1.2)).toBe(true)
    expect(trimmedRate(1, 0)).toBe(1); expect(trimmedRate(1, 0.01)).toBe(1)   // inside the dead zone
    expect(trimmedRate(1, 0.05)).toBeLessThan(1)                               // ahead: a touch slower
    expect(trimmedRate(1, -0.05)).toBeGreaterThan(1)                           // behind: a touch faster
    expect(trimmedRate(0.8, 0.5)).toBeCloseTo(0.8 * (1 - CLIPS.trimMax))       // never more than trimMax
  })
  it('spreads filmstrip frames over the video and picks the right one per tile', () => {
    expect(frameTimes(8, 4)).toEqual([1, 3, 5, 7])
    expect(frameIndex(4, 0, 64, 64, 0, 1, 8)).toBe(0)            // tile 0 covers 0..1 s -> frame 0
    expect(frameIndex(4, 64 * 4, 64, 64, 0, 1, 8)).toBe(2)       // 4..5 s -> frame 2
    expect(frameIndex(4, 0, 64, 64, 6, 1, 8)).toBe(3)            // srcIn 6 -> last frame
    expect(frameIndex(0, 0, 64, 64, 0, 1, 8)).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { splitAt, deleteClips, newProject, setClipSpeed } from './ops'
import { sourceToTimeline, timelineToSource } from './sync'

describe('player <-> editor position sync', () => {
  it('is the identity on an untouched song', () => {
    const p = newProject('/s.m4a', 200)
    expect(sourceToTimeline(p, '/s.m4a', 73.25)).toBeCloseTo(73.25)
    expect(timelineToSource(p, 73.25)).toEqual({ src: '/s.m4a', s: 73.25 })
  })
  it('maps through cuts: a deleted part has no position, later parts shift', () => {
    let p = splitAt(newProject('/s.m4a', 200), 50); p = splitAt(p, 100)
    const mid = p.clips.find((c) => c.start === 50)!
    p = deleteClips(p, [mid.id])
    expect(sourceToTimeline(p, '/s.m4a', 75)).toBeNull()
    expect(sourceToTimeline(p, '/s.m4a', 120)).toBeCloseTo(120)
    expect(timelineToSource(p, 75)).toBeNull()
  })
  it('accounts for clip speed', () => {
    const base = newProject('/s.m4a', 100), p = setClipSpeed(base, base.clips[0].id, 2)   // 100s of song now takes 50s on the timeline
    expect(sourceToTimeline(p, '/s.m4a', 60)).toBeCloseTo(30)
    expect(timelineToSource(p, 30)?.s).toBeCloseTo(60)
  })
})

import { describe, expect, it } from 'vitest'
import { newProject, deleteClips, splitAt, patchClips, setClipSpeed } from './ops'
import { isPristine } from './pristine'

describe('isPristine', () => {
  const p = newProject('/s.m4a', 100)
  it('is true for a fresh project', () => expect(isPristine(p)).toBe(true))
  it('is false after a cut, a delete, a fade, a speed change or an explicit mix', () => {
    expect(isPristine(splitAt(p, 40))).toBe(false)
    expect(isPristine(deleteClips(p, [p.clips[0].id]))).toBe(false)
    expect(isPristine(patchClips(p, [p.clips[0].id], { fadeIn: 2 }))).toBe(false)
    expect(isPristine(setClipSpeed(p, p.clips[0].id, 0.5))).toBe(false)
    expect(isPristine({ ...p, master: { speed: 0.8, pitchLock: false, wet: 0, decay: 3, damping: 0.3 } })).toBe(false)
  })
})

import { setTrack } from './ops'
describe('isPristine and track effects', () => {
  it('is false when any track has EQ or reverb, so the player plays the edit with it', () => {
    const p = newProject('/s.m4a', 100), id = p.tracks[0].id
    expect(isPristine(setTrack(p, id, { fx: { low: 6, mid: 0, high: 0 } }))).toBe(false)
    expect(isPristine(setTrack(p, id, { fx: { low: 0, mid: 0, high: 0, reverb: { wet: 0.3, decay: 2, damping: 0.4 } } }))).toBe(false)
    expect(isPristine(setTrack(p, id, { fx: { low: 0, mid: 0, high: 0 } }))).toBe(true)
  })
})

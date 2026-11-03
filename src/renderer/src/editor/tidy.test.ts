import { describe, expect, it } from 'vitest'
import { addTrack, moveClips, newProject, setTrack } from './ops'
import { sweepEmptyTracks, tidyTracks } from './tidy'

describe('auto-delete empty tracks', () => {
  const base = { ...addTrack(newProject('/s.m4a', 100)), autoDeleteEmpty: true }
  it('removes a track that just became empty (its clip moved to another track)', () => {
    const id = base.clips[0].id, moved = moveClips(base, [id], 0, 1)          // clip A1 -> A2
    const out = tidyTracks(base, moved)
    expect(out.tracks).toHaveLength(1); expect(out.clips[0].track).toBe(out.tracks[0].id)
  })
  it('leaves a track alone that never had clips (made on purpose) and does nothing when off', () => {
    expect(tidyTracks(base, base).tracks).toHaveLength(2)
    const off = { ...base, autoDeleteEmpty: false }, moved = moveClips(off, [off.clips[0].id], 0, 1)
    expect(tidyTracks(off, moved).tracks).toHaveLength(2)
  })
  it('never removes locked tracks or the last track', () => {
    const id = base.clips[0].id, locked = setTrack(base, base.tracks[0].id, { lock: true }), moved = moveClips(base, [id], 0, 1)
    expect(tidyTracks(locked, { ...moved, tracks: moved.tracks.map((t, i) => (i === 0 ? { ...t, lock: true } : t)) }).tracks).toHaveLength(2)
    expect(sweepEmptyTracks({ ...base, clips: [] }).tracks).toHaveLength(1)
  })
  it('sweep removes already-empty tracks', () => expect(sweepEmptyTracks(base).tracks).toHaveLength(1))
})

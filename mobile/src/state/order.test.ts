import { describe, expect, it } from 'vitest'
import { DEFAULT_FX } from '@app/config/fx'
import { PRESETS } from '@app/config/presets'
import { afterEnd, matchPreset, neighbour, resumeAt } from './order'

const ids = ['a', 'b', 'c']
describe('neighbour', () => {
  it('moves and wraps both ways', () => {
    expect(neighbour(ids, 'a', 1)).toBe('b')
    expect(neighbour(ids, 'c', 1)).toBe('a')
    expect(neighbour(ids, 'a', -1)).toBe('c')
    expect(neighbour(ids, 'b', -1)).toBe('a')
  })
  it('handles no current song and an empty list', () => {
    expect(neighbour(ids, null, 1)).toBe('a'); expect(neighbour(ids, null, -1)).toBe('c')
    expect(neighbour(ids, 'gone', 1)).toBe('a'); expect(neighbour([], null)).toBeNull()
  })
})
describe('afterEnd (auto-advance rule)', () => {
  it('advances only when enabled and there is something else to play', () => {
    expect(afterEnd(ids, 'a', true)).toBe('b')
    expect(afterEnd(ids, 'c', true)).toBe('a')
    expect(afterEnd(ids, 'a', false)).toBeNull()
    expect(afterEnd(['a'], 'a', true)).toBeNull()
  })
})
describe('resumeAt', () => {
  it('ignores the very start and the very end', () => {
    expect(resumeAt(1, 200)).toBe(0); expect(resumeAt(100, 200)).toBe(100); expect(resumeAt(198, 200)).toBe(0); expect(resumeAt(100, 0)).toBe(100)
  })
})
describe('matchPreset', () => {
  it('finds built-in and user presets by exact values, else null', () => {
    expect(matchPreset(PRESETS[2].fx, [])).toBe('Slowed + Reverb')
    expect(matchPreset({ ...DEFAULT_FX, speed: 0.77 }, [])).toBeNull()
    expect(matchPreset({ ...DEFAULT_FX, speed: 0.77 }, [{ name: 'Mine', fx: { ...DEFAULT_FX, speed: 0.77 } }])).toBe('Mine')
  })
})

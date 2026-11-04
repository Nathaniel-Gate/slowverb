import { NEONS, neonFor } from '@shared/neon'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyNeon } from './neon'

afterEach(() => vi.unstubAllGlobals())
describe('phone neon', () => {
  it('the same song always gets the same neon from the shared list, and spreads over the list', () => {
    expect(neonFor('Songs/a.m4a')).toBe(neonFor('Songs/a.m4a')); expect(NEONS).toContain(neonFor('Songs/a.m4a'))
    expect(new Set(Array.from({ length: 60 }, (_, i) => neonFor(`Songs/track ${i}.m4a`))).size).toBeGreaterThanOrEqual(8)
  })
  it('sets --neon and --accent on the page, and removes them when nothing is playing', () => {
    const props = new Map<string, string>()
    vi.stubGlobal('document', { documentElement: { style: { setProperty: (k: string, v: string) => props.set(k, v), removeProperty: (k: string) => void props.delete(k) } } })
    applyNeon('Songs/a.m4a'); expect(props.get('--neon')).toBe(neonFor('Songs/a.m4a')); expect(props.get('--accent')).toBe(props.get('--neon'))
    applyNeon(null); expect(props.size).toBe(0)
  })
})

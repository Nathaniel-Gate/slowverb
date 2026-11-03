import { describe, expect, it } from 'vitest'
import { dampToHz, makeImpulse } from './reverb'

describe('makeImpulse', () => {
  it('length = pre-delay + decay seconds', () => {
    const [l] = makeImpulse(1000, 2, () => 0.9)
    expect(l.length).toBe(20 + 2000)
  })
  it('is silent in the pre-delay and fades to ~0 at the end', () => {
    const [l] = makeImpulse(1000, 2, () => 1)
    expect(l.slice(0, 20).every((v) => v === 0)).toBe(true)
    expect(Math.abs(l[l.length - 1])).toBeLessThan(1e-6)
    expect(l[21]).toBeGreaterThan(l[1000])
  })
})
describe('dampToHz', () => {
  it('darker = lower cutoff', () => { expect(dampToHz(0)).toBeGreaterThan(dampToHz(1)); expect(dampToHz(1)).toBeCloseTo(1500) })
})

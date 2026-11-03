import { describe, expect, it } from 'vitest'
import { shouldGrain } from './scrubGate'
const c = { minMove: 0.02, repeatGuard: 0.35, minInterval: 0.03 }
describe('shouldGrain', () => {
  it('fires the first grain', () => expect(shouldGrain(-1, 0, 12, 5, c)).toBe(true))
  it('does not replay the same spot a moment later (down + first move)', () => {
    expect(shouldGrain(12, 5, 12.004, 5.06, c)).toBe(false)
    expect(shouldGrain(12, 5, 12.015, 5.2, c)).toBe(false)
  })
  it('allows the same spot again after the guard window', () => expect(shouldGrain(12, 5, 12.004, 5.5, c)).toBe(true))
  it('fires when the playhead really moved', () => expect(shouldGrain(12, 5, 12.2, 5.06, c)).toBe(true))
  it('drops calls closer together than the minimum interval', () => expect(shouldGrain(12, 5, 20, 5.01, c)).toBe(false))
})

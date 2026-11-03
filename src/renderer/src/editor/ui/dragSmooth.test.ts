import { describe, expect, it } from 'vitest'
import { easeDrag } from './dragSmooth'
import type { Drag } from './timelineDrags'

const fade = (dur: number): Drag => ({ kind: 'fade', id: 'a', edge: 'out', dur })
describe('easeDrag', () => {
  it('glides monotonically to the target without overshoot and then reports done', () => {
    let shown: Drag | null = fade(0), steps = 0, last = 0
    for (; steps < 200; steps++) {
      const r = easeDrag(shown, fade(4), 0.4, 0.0005); shown = r.d
      const v = (shown as Extract<Drag, { kind: 'fade' }>).dur
      expect(v).toBeGreaterThanOrEqual(last); expect(v).toBeLessThanOrEqual(4); last = v
      if (r.done) break
    }
    expect(steps).toBeLessThan(40); expect(last).toBeCloseTo(4, 2)
  })
  it('does not smooth discrete drags and starts straight at the target when there is nothing shown yet', () => {
    const mv: Drag = { kind: 'move', ids: ['a'], dt: 3, trackShift: 0, dup: false }
    expect(easeDrag(mv, mv, 0.4, 0.001).d).toBe(mv)
    expect(easeDrag(null, fade(2), 0.4, 0.001)).toEqual({ d: fade(2), done: true })
  })
})

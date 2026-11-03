import { describe, expect, it } from 'vitest'
import type { Clip, Loop } from '../model'
import { expandLoopSelection, groupLoops, handlePatch, loopGeom, memberIndex } from './loopMath'

const c = (id: string, start: number, loop?: string): Clip => ({ id, src: '/a', track: 'T', start, srcIn: 0, srcOut: 2, gain: 1, fadeIn: 0.5, fadeOut: 0.5, loop })
const clips = [c('x', 0), c('l2', 3, 'L'), c('l1', 1.5, 'L'), c('l3', 4.5, 'L')]
const L: Loop = { id: 'L', track: 'T', src: '/a', srcIn: 0, srcOut: 2, start: 1.5, count: 3, xfade: 0.5, gain: 1 }

describe('loopMath', () => {
  it('groups repeats in start order and indexes them', () => {
    const g = groupLoops(clips)
    expect(g.get('L')!.map(x => x.id)).toEqual(['l1', 'l2', 'l3'])
    expect(memberIndex(g).get('l3')).toEqual({ loop: 'L', rep: 2 })
  })
  it('completes a partly selected loop, leaves others alone', () => {
    const g = groupLoops(clips)
    expect(expandLoopSelection(g, ['x'])).toBeNull()
    expect(expandLoopSelection(g, ['x', 'l2'])).toEqual(['x', 'l2', 'l1', 'l3'])
    expect(expandLoopSelection(g, ['l1', 'l2', 'l3'])).toBeNull()
  })
  it('reads geometry from the repeats', () => {
    const g = loopGeom(groupLoops(clips).get('L'))!
    expect(g).toMatchObject({ start: 1.5, end: 6.5, period: 1.5, xfade: 0.5, count: 3 })
  })
  it('turns handle drags into loop patches', () => {
    expect(handlePatch('in', L, 0.1)).toEqual({ srcIn: 0.1 })
    expect(handlePatch('out', L, -0.2).srcOut).toBeCloseTo(1.8)
    expect(handlePatch('xfade', L, -0.25)).toEqual({ xfade: 0.75 })
    expect(handlePatch('xfade', L, 5)).toEqual({ xfade: 0 })
    expect(handlePatch('count', L, 3.1)).toEqual({ count: 5 })   // period 1.5: round(2.07) = 2 more
    expect(handlePatch('count', L, -40)).toEqual({ count: 1 })
  })
})

import { describe, expect, it } from 'vitest'
import type { Clip } from '../model'
import { applyEnvEdit, insertIndex, withEnv } from './envMath'

const clip = (env?: Clip['env']): Clip => ({ id: 'a', src: 's', track: 't', start: 0, srcIn: 0, srcOut: 10, gain: 1, fadeIn: 0, fadeOut: 0, env })

describe('envelope drag maths', () => {
  it('a first point brings unity anchors at both clip ends', () => {
    const env = applyEnvEdit(clip(), 10, { kind: 'env', id: 'a', index: insertIndex([], 4), add: true, t: 4, g: 0.2 })
    expect(env.map(p => p.t)).toEqual([0, 4, 10]); expect(env.map(p => p.g)).toEqual([1, 0.2, 1])
  })
  it('a moved point never crosses its neighbours', () => {
    const c = clip([{ t: 0, g: 1 }, { t: 5, g: 0.5 }, { t: 10, g: 1 }])
    const env = applyEnvEdit(c, 10, { kind: 'env', id: 'a', index: 1, add: false, t: 99, g: 0.5 })
    expect(env[1].t).toBeLessThan(10); expect(env[1].t).toBeGreaterThan(0)
  })
  it('withEnv replaces one clip envelope and drops an empty one', () => {
    const p = { clips: [clip([{ t: 1, g: 1 }])] }
    expect(withEnv(p, 'a', []).clips[0].env).toBeUndefined()
  })
})

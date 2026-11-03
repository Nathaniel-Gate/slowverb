import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_FX } from '../../config/fx'
import { effectiveFx, useFx } from './fx.store'

beforeEach(() => useFx.setState({ fx: DEFAULT_FX, preset: 'Original', bypass: false, touched: 0, userPresets: [] }))
describe('fx store', () => {
  it('preset applies and highlights; manual tweak clears highlight', () => {
    useFx.getState().applyPreset('Slowed + Reverb')
    expect(useFx.getState().fx.speed).toBe(0.8); expect(useFx.getState().preset).toBe('Slowed + Reverb')
    useFx.getState().set({ speed: 0.9 }); expect(useFx.getState().preset).toBeNull()
  })
  it('bypass returns the original without losing the version', () => {
    useFx.getState().set({ speed: 0.7, wet: 0.5 }); useFx.getState().toggleBypass()
    expect(effectiveFx(useFx.getState())).toEqual(DEFAULT_FX); expect(useFx.getState().fx.speed).toBe(0.7)
  })
  it('user presets save, apply and delete; replace() does not count as a user edit', () => {
    useFx.getState().set({ speed: 0.6 }); useFx.getState().saveUserPreset('mine')
    useFx.getState().set({ speed: 1 }); useFx.getState().applyPreset('mine')
    expect(useFx.getState().fx.speed).toBe(0.6)
    const t = useFx.getState().touched; useFx.getState().replace(DEFAULT_FX); expect(useFx.getState().touched).toBe(t)
    useFx.getState().deleteUserPreset('mine'); expect(useFx.getState().userPresets).toHaveLength(0)
  })
})

import { describe, expect, it } from 'vitest'
import { installBrowserFakes } from '../audio/testkit'

describe('settings store', () => {
  it('defaults to auto-advance + play on tap and persists changes', async () => {
    const { store } = installBrowserFakes()
    const { useSettings } = await import('./settings.store')
    expect(useSettings.getState().autoAdvance).toBe(true); expect(useSettings.getState().playOnTap).toBe(true)
    useSettings.getState().set({ autoAdvance: false })
    expect(JSON.parse(store.get('slowverb.settings')!)).toEqual({ autoAdvance: false, playOnTap: true })
  })
})

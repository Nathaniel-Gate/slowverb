import { create } from 'zustand'
import { CONFIG } from '../config'

type Values = { autoAdvance: boolean; playOnTap: boolean }
type S = Values & { set(p: Partial<Values>): void }

const load = (): Values => {
  try { return { ...CONFIG.defaultSettings, ...JSON.parse(localStorage.getItem(CONFIG.keys.settings) ?? '{}') } } catch { return { ...CONFIG.defaultSettings } }
}
export const useSettings = create<S>((set, get) => ({
  ...load(),
  set(p) {
    set(p)
    const { autoAdvance, playOnTap } = get()
    try { localStorage.setItem(CONFIG.keys.settings, JSON.stringify({ autoAdvance, playOnTap })) } catch { /* memory only */ }
  }
}))

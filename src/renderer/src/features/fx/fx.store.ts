import { create } from 'zustand'
import type { Fx } from '../../../../shared/types'
import { DEFAULT_FX } from '../../config/fx'
import { PRESETS } from '../../config/presets'

type S = {
  fx: Fx; preset: string | null; bypass: boolean; touched: number; // touched++ on user edits only (per-track memory keys off this)
  userPresets: { name: string; fx: Fx }[]
  set(p: Partial<Fx>): void                 // manual tweak, clears preset highlight
  applyPreset(name: string): void
  replace(fx: Fx, preset?: string | null): void // load a saved version (no side effects beyond state)
  toggleBypass(): void                      // A/B: original vs your version
  saveUserPreset(name: string): void
  deleteUserPreset(name: string): void
}
export const allPresets = (user: S['userPresets']) => [...PRESETS, ...user]

export const useFx = create<S>((set, get) => ({
  fx: DEFAULT_FX, preset: 'Original', bypass: false, touched: 0, userPresets: [],
  set: (p) => set({ fx: { ...get().fx, ...p }, preset: null, touched: get().touched + 1 }),
  applyPreset(name) {
    const hit = allPresets(get().userPresets).find((x) => x.name === name)
    if (hit) set({ fx: { ...hit.fx }, preset: name, bypass: false, touched: get().touched + 1 })
  },
  replace: (fx, preset = null) => set({ fx: { ...DEFAULT_FX, ...fx }, preset }),
  toggleBypass: () => set({ bypass: !get().bypass }),
  saveUserPreset(name) {
    const n = name.trim(); if (!n) return
    set({ userPresets: [...get().userPresets.filter((x) => x.name !== n), { name: n, fx: { ...get().fx } }], preset: n })
  },
  deleteUserPreset: (name) => set({ userPresets: get().userPresets.filter((x) => x.name !== name) })
}))
/** The fx actually heard right now (A/B bypass returns the original). */
export const effectiveFx = (s: Pick<S, 'fx' | 'bypass'>): Fx => (s.bypass ? DEFAULT_FX : s.fx)

import { create } from 'zustand'

/** Which editor overlays are open. The key handler stays out of the way while any is. */
type O = { palette: boolean; shortcuts: boolean; history: boolean; menu: boolean; capturing: boolean; set(p: Partial<Omit<O, 'set'>>): void }
export const useOverlay = create<O>((set) => ({ palette: false, shortcuts: false, history: false, menu: false, capturing: false, set: (p) => set(p) }))
export const anyOverlay = () => { const o = useOverlay.getState(); return o.palette || o.shortcuts || o.menu }

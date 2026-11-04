import { create } from 'zustand'
import { CATEGORIES, DEFAULT_CATEGORY } from '../../../../shared/config'

/** What the "Where does this go?" popup returns: the home folder, existing playlists to join, and an optional new playlist to create. */
export type Placement = { category: string; listIds: string[]; newList: string }
type Req = { what: string; preLists: string[]; category: string; resolve(p: Placement | null): void }
type S = { req: Req | null; ask(what: string, preLists?: string[], category?: string): Promise<Placement | null>; close(p: Placement | null): void }

const KEY = 'slowverb.lastCategory'
const lastCategory = () => { try { const v = localStorage.getItem(KEY); if (v && (CATEGORIES as readonly string[]).includes(v)) return v } catch { /* storage blocked: default */ } return DEFAULT_CATEGORY }

export const useAddPopup = create<S>((set, get) => ({
  req: null,
  /** Opens the popup and resolves when the user confirms (a Placement) or cancels (null). One popup at a time. */
  ask: (what, preLists = [], category) => new Promise((resolve) => { get().req?.resolve(null); set({ req: { what, preLists, category: category && (CATEGORIES as readonly string[]).includes(category) ? category : lastCategory(), resolve } }) }),
  close(p) {
    const r = get().req; if (!r) return
    if (p) { try { localStorage.setItem(KEY, p.category) } catch { /* ignore */ } }
    set({ req: null }); r.resolve(p)
  }
}))

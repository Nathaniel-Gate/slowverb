import { create } from 'zustand'
import { mediaUrl } from '../../../shared/mediaUrl'
import type { PinState, VisualItem } from '../../../shared/visualsModel'
import type { DlProgress } from '../../../shared/types'
import { CLIPS } from '../config/clips'

// Clips-tab-only UI state: the Visuals library list, thumbnails, the media browser's filters, downloads and Pinterest.
// The EDIT itself lives in the editor store (one project per song, visual tracks; see editor/kinds.ts).
const PRIVATE_KEY = 'slowverb.clips.privateBoards'
const readPrivate = () => { try { const v = localStorage.getItem(PRIVATE_KEY); return v === null ? CLIPS.privateBoardsDefault : v === '1' } catch { return CLIPS.privateBoardsDefault } }

export type Dl = { busy: boolean; stage: string; pct: number | null; note: string | null; error: boolean; last: string }
type S = {
  items: VisualItem[]; loaded: boolean
  thumbs: Record<string, string | null>          // path -> media:// URL of its thumbnail (null = none, show the picture itself)
  frames: Record<string, string[]>               // video path -> filmstrip frame URLs
  q: string; kind: '' | 'image' | 'video'; group: string; picked: string | null
  dl: Dl; privateBoards: boolean; pins: PinState
  refresh(): Promise<void>
  thumb(path: string): void
  setFrames(path: string, urls: string[]): void
  importFiles(paths: string[], group?: string): Promise<string[]>
  set(p: Partial<Pick<S, 'q' | 'kind' | 'group' | 'picked'>>): void
  setPrivate(on: boolean): void
  fetchLink(input: string): Promise<string[]>
  syncPinterest(): Promise<void>
  forgetBoard(url: string): Promise<void>
  cancel(): void
}
const pending = new Set<string>()

export const useClips = create<S>((set, get) => ({
  items: [], loaded: false, thumbs: {}, frames: {}, q: '', kind: '', group: '', picked: null,
  dl: { busy: false, stage: '', pct: null, note: null, error: false, last: '' }, privateBoards: readPrivate(), pins: { version: 1, boards: [] },

  async refresh() {
    try { set({ items: await window.api.visualsList(), loaded: true }) } catch (e) { console.error('[clips] list failed', e); set({ loaded: true }) }
    try { if (window.api.pinState) set({ pins: await window.api.pinState() }) } catch { /* no saved boards yet */ }
  },
  thumb(path) {
    if (path in get().thumbs || pending.has(path)) return
    pending.add(path)
    void window.api.visualsThumb(path).then((f) => set({ thumbs: { ...get().thumbs, [path]: f ? mediaUrl(f) : null } }), () => set({ thumbs: { ...get().thumbs, [path]: null } }))
      .finally(() => pending.delete(path))
  },
  setFrames: (path, urls) => set({ frames: { ...get().frames, [path]: urls } }),
  async importFiles(paths, group) {
    const out = await window.api.visualsImport(paths, group)
    await get().refresh(); return out
  },
  set: (p) => set(p),
  setPrivate(on) { set({ privateBoards: on }); try { localStorage.setItem(PRIVATE_KEY, on ? '1' : '0') } catch { /* storage blocked */ } },

  async fetchLink(input) {
    if (get().dl.busy) return []
    set({ dl: { busy: true, stage: 'Starting', pct: null, note: null, error: false, last: input } })
    const off = window.api.onMediaProgress((p: DlProgress) => set({ dl: { ...get().dl, stage: p.stage, pct: p.pct } }))
    try {
      const r = await window.api.mediaFetch(input, { privateBoards: get().privateBoards })
      await get().refresh()
      set({ dl: { ...get().dl, busy: false, stage: r.error ? 'Failed' : 'Done', pct: r.error ? null : 100, error: !!r.error, note: r.error ?? r.note ?? (r.paths.length ? `Added ${r.paths.length} file${r.paths.length === 1 ? '' : 's'}` : 'Nothing new to add') } })
      return r.paths
    } catch (e) {
      set({ dl: { ...get().dl, busy: false, stage: 'Failed', error: true, note: e instanceof Error ? e.message : String(e) } }); return []
    } finally { off() }
  },
  async syncPinterest() {
    if (get().dl.busy) return
    set({ dl: { busy: true, stage: 'Syncing Pinterest', pct: null, note: null, error: false, last: 'pinterest' } })
    const off = window.api.onMediaProgress((p: DlProgress) => set({ dl: { ...get().dl, stage: p.stage, pct: p.pct } }))
    try {
      const r = await window.api.pinSyncAll({ privateBoards: get().privateBoards })
      await get().refresh()
      set({ dl: { ...get().dl, busy: false, stage: r.error ? 'Failed' : 'Done', error: !!r.error, note: r.error ?? r.note ?? (r.paths.length ? `${r.paths.length} new pin${r.paths.length === 1 ? '' : 's'}` : 'Boards are up to date') } })
    } catch (e) { set({ dl: { ...get().dl, busy: false, stage: 'Failed', error: true, note: e instanceof Error ? e.message : String(e) } }) } finally { off() }
  },
  async forgetBoard(url) { set({ pins: await window.api.pinForget(url) }) },
  cancel() { void window.api.mediaCancel() }
}))

/** Items after the media browser's search and filters. */
export function filtered(s: Pick<S, 'items' | 'q' | 'kind' | 'group'>): VisualItem[] {
  const n = s.q.trim().toLowerCase()
  return s.items.filter((i) => (!s.kind || i.kind === s.kind) && (!s.group || i.group === s.group || i.group.startsWith(s.group + '/')) && (!n || `${i.name} ${i.group}`.toLowerCase().includes(n)))
}
/** Top-level groups for the filter (Images, Videos, pinterest/<user>/<board> boards listed in full). */
export const groupsOf = (items: VisualItem[]) => [...new Set(items.map((i) => i.group))].sort((a, b) => a.localeCompare(b))

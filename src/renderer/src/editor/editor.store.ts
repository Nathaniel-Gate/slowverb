import { create } from 'zustand'
import { encodeWav } from '../audio/wav'
import { engine } from '../audio/engine'
import { EDITOR } from '../config/editorKeys'
import { useLibrary } from '../features/library/library.store'
import { createHistory, pushHistory, redo as redoH, undo as undoH, type History } from './history'
import { clipDur, projectEnd, type Clip, type Project, type Tool } from './model'
import * as ops from './ops'
import { computePeaks, type Peaks } from './peaks'
import { renderProject } from './render'
import { loadBuffers, type Buffers } from './schedule'
import { editorTransport } from './transport'

type SaveState = 'saved' | 'saving' | 'dirty'
type S = {
  open: boolean; project: Project | null; hist: History | null; buffers: Buffers; peaks: Map<string, Peaks>
  selection: string[]; tool: Tool; playhead: number; playing: boolean; pxPerSec: number; scrollX: number; scrollY: number; viewWidth: number
  snap: boolean; markIn: number | null; markOut: number | null; saveState: SaveState; busy: string | null; note: string | null; clipboard: Clip[]
  openSong(path: string): Promise<void>; show(): void; close(): void; flush(): Promise<void>
  apply(fn: (p: Project) => Project): void; undo(): void; redo(): void
  select(ids: string[], additive?: boolean): void; setTool(t: Tool): void
  setZoom(pxPerSec: number, anchorSec?: number): void; setScroll(x: number): void; setScrollY(y: number): void; setViewWidth(w: number): void; fitToView(viewWidth: number): void
  setPlayhead(t: number): void; now(): number; toggleSnap(): void; togglePlay(): Promise<void>
  splitAtPlayhead(): void; deleteSelection(ripple: boolean): void; selectAll(): void
  copy(): void; cut(): void; paste(): void; setMark(which: 'in' | 'out', t: number | null): void; addMarkerAtPlayhead(): void
  renderToLibrary(): Promise<void>; renameVersion(name: string): Promise<void>; renameSong(name: string): Promise<void>
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const mapHist = (h: History, f: (p: Project) => Project): History => ({ past: h.past.map(f), present: f(h.present), future: h.future.map(f) })
const swapKey = <T,>(o: Record<string, T>, from: string, to: string) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === from ? to : k, v]))
const swapPath = (p: Project, from: string, to: string): Project => ({
  ...p, song: p.song === from ? to : p.song, sources: swapKey(p.sources, from, to), clips: p.clips.map((c) => (c.src === from ? { ...c, src: to } : c))
})

export const useEditor = create<S>((set, get) => {
  let saveTimer: number | undefined, noteTimer: number | undefined, opening = 0
  const note = (text: string) => { clearTimeout(noteTimer); set({ note: text }); noteTimer = window.setTimeout(() => set({ note: null }), EDITOR.noteMs) }
  const stopPlayback = () => { if (get().playing) { const t = editorTransport.pause(); set({ playing: false, playhead: t }) } }
  const schedule = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(() => void get().flush(), EDITOR.autosaveMs) }
  const step = (f: (h: History) => History) => {
    const h = get().hist; if (!h) return
    const n = f(h); if (n === h) return
    set({ hist: n, project: n.present, saveState: 'dirty' }); schedule()
    if (get().playing) editorTransport.seek(n.present, get().buffers, editorTransport.position())
  }
  editorTransport.onEnded = () => set({ playing: false, playhead: get().project ? projectEnd(get().project!) : 0 })

  return {
    open: false, project: null, hist: null, buffers: new Map(), peaks: new Map(), selection: [], tool: 'select', playhead: 0, playing: false,
    pxPerSec: EDITOR.defaultPxPerSec, scrollX: 0, scrollY: 0, viewWidth: 0, snap: true, markIn: null, markOut: null,
    saveState: 'saved', busy: null, note: null, clipboard: [],

    async openSong(path) {
      const s = get()
      if (s.project?.song === path) { get().show(); return }
      await get().flush(); stopPlayback(); engine.el.pause()
      const token = ++opening
      set({ open: true, busy: 'Loading', project: null, hist: null })
      try {
        const names = await window.api.editorList(path)
        let project = names.length ? await window.api.editorLoad(path, names[0]) : null
        const fresh = !project
        project ??= ops.newProject(path, useLibrary.getState().tracks.find((t) => t.path === path)?.duration || 1, 'Edit')
        const buffers = await loadBuffers(project, editorTransport.ctx)
        const real = buffers.get(path)?.duration
        if (fresh && real && Math.abs(real - project.sources[path].duration) > 1e-3) project = ops.newProject(path, real, 'Edit')
        if (token !== opening) return
        const peaks = new Map<string, Peaks>(); buffers.forEach((b, k) => peaks.set(k, computePeaks(b)))
        set({
          project, hist: createHistory(project), buffers, peaks, selection: [], playhead: 0, scrollX: 0, scrollY: 0, markIn: null, markOut: null,
          saveState: 'saved', busy: null, tool: 'select'
        })
        get().fitToView(get().viewWidth || 1000)
      } catch (e) {
        console.error('[editor] open failed', path, e); set({ open: false, busy: null }); note('Could not open')
      }
    },
    show() { if (get().project) { engine.el.pause(); set({ open: true }) } },
    close() { stopPlayback(); void get().flush(); set({ open: false }) },
    async flush() {
      clearTimeout(saveTimer)
      const { project, saveState } = get(); if (!project || saveState === 'saved') return
      set({ saveState: 'saving' })
      try { await window.api.editorSave(project.song, project) } catch (e) { console.error('[editor] save failed', e); set({ saveState: 'dirty' }); return }
      set({ saveState: get().project === project ? 'saved' : 'dirty' })
    },

    apply(fn) {
      const { project, hist } = get(); if (!project || !hist) return
      const next = fn(project); if (next === project) return
      const h = pushHistory(hist, next); if (h === hist) return
      const ids = new Set(h.present.clips.map((c) => c.id))
      set({ hist: h, project: h.present, saveState: 'dirty', selection: get().selection.filter((id) => ids.has(id)) })
      schedule()
      if (get().playing) editorTransport.seek(h.present, get().buffers, editorTransport.position())
    },
    undo() { step(undoH) },
    redo() { step(redoH) },

    select(ids, additive) {
      if (!additive) return set({ selection: [...new Set(ids)] })
      const cur = new Set(get().selection)
      if (ids.length === 1 && cur.has(ids[0])) cur.delete(ids[0]); else ids.forEach((id) => cur.add(id))
      set({ selection: [...cur] })
    },
    setTool: (tool) => set({ tool }),
    setZoom(px, anchorSec) {
      const { pxPerSec, scrollX } = get(), next = clamp(px, EDITOR.zoomMin, EDITOR.zoomMax)
      const anchor = anchorSec ?? scrollX / pxPerSec, screenX = anchorSec === undefined ? 0 : anchor * pxPerSec - scrollX   // anchor keeps its screen x
      set({ pxPerSec: next, scrollX: Math.max(0, anchor * next - screenX) })
    },
    setScroll: (x) => set({ scrollX: Math.max(0, x) }),
    setScrollY: (y) => set({ scrollY: Math.max(0, y) }),
    setViewWidth: (viewWidth) => set({ viewWidth }),
    fitToView(w) {
      const p = get().project; if (!p) return
      set({ pxPerSec: clamp((w - EDITOR.fitPadPx) / Math.max(projectEnd(p), 1), EDITOR.zoomMin, EDITOR.zoomMax), scrollX: 0 })
    },

    now: () => (get().playing ? editorTransport.position() : get().playhead),
    setPlayhead(t) {
      const { project, buffers } = get(), pos = Math.max(0, t); set({ playhead: pos })
      if (project) editorTransport.seek(project, buffers, pos)
    },
    toggleSnap: () => set({ snap: !get().snap }),
    async togglePlay() {
      const { project, buffers, playing, playhead } = get(); if (!project) return
      if (playing) { stopPlayback(); return }
      const end = projectEnd(project), from = playhead >= end - EDITOR.edgeEps ? 0 : playhead
      set({ playing: true, playhead: from })
      try { await editorTransport.play(project, buffers, from) } catch (e) { console.error('[editor] play failed', e); set({ playing: false }) }
    },

    splitAtPlayhead() {
      const t = get().now(), sel = get().selection, p = get().project; if (!p) return
      const hit = sel.filter((id) => { const c = p.clips.find((x) => x.id === id); return c && t > c.start && t < c.start + clipDur(c) })
      get().apply((q) => ops.splitAt(q, t, hit.length ? hit : undefined))
    },
    deleteSelection(ripple) {
      const ids = get().selection; if (!ids.length) return
      get().apply((p) => (ripple ? ops.rippleDelete(p, ids) : ops.deleteClips(p, ids))); set({ selection: [] })
    },
    selectAll: () => set({ selection: get().project?.clips.map((c) => c.id) ?? [] }),
    copy() { const { project, selection } = get(); if (project && selection.length) set({ clipboard: project.clips.filter((c) => selection.includes(c.id)) }) },
    cut() { get().copy(); get().deleteSelection(false) },
    paste() {
      const { clipboard, project } = get(); if (!project || !clipboard.length) return
      const before = new Set(project.clips.map((c) => c.id)), t = get().now()
      get().apply((p) => ops.pasteClips(p, clipboard, t))
      const added = get().project!.clips.filter((c) => !before.has(c.id)).map((c) => c.id)
      if (added.length) set({ selection: added })
    },
    setMark: (which, t) => set(which === 'in' ? { markIn: t } : { markOut: t }),
    addMarkerAtPlayhead() { const t = get().now(); get().apply((p) => ops.addMarker(p, t)) },

    async renderToLibrary() {
      await get().flush()
      const { project, buffers } = get(); if (!project || get().busy) return
      set({ busy: 'Rendering' })
      try {
        const { channels, rate } = await renderProject(project, buffers)
        set({ busy: 'Writing' })
        await window.api.saveRender(project.song, project.name, encodeWav(channels, rate))
        set({ busy: null }); note('Saved to library')
      } catch (e) { console.error('[editor] render failed', e); set({ busy: null }); note('Render failed') }
    },
    async renameVersion(name) {
      const { project, hist } = get(), to = name.trim(); if (!project || !hist || !to || to === project.name) return
      await get().flush()
      try { if ((await window.api.editorList(project.song)).includes(project.name)) await window.api.editorRenameVersion(project.song, project.name, to) }
      catch (e) { console.error('[editor] rename version failed', e); return note('Rename failed') }
      const h = mapHist(hist, (p) => ({ ...p, name: to })); set({ hist: h, project: h.present, saveState: 'dirty' }); schedule()   // rewrite the file so its JSON carries the new name
    },
    async renameSong(name) {
      const { project, hist, buffers, peaks } = get(), base = name.trim(); if (!project || !hist || !base) return
      await get().flush(); stopPlayback()
      try {
        const from = project.song, to = await window.api.renameSong(from, base)
        if (to === from) return
        const h = mapHist(hist, (p) => swapPath(p, from, to))
        const rekey = <T,>(m: Map<string, T>) => new Map([...m].map(([k, v]) => [k === from ? to : k, v] as const))
        const tr = useLibrary.getState().tracks.find((t) => t.path === from); if (tr) useLibrary.getState().setPath(tr.id, to)
        set({ hist: h, project: h.present, buffers: rekey(buffers), peaks: rekey(peaks) })
      } catch (e) { console.error('[editor] rename song failed', e); note('Rename failed') }
    }
  }
})

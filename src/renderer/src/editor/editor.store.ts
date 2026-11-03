import { create } from 'zustand'
import { encodeWav } from '../audio/wav'
import { engine } from '../audio/engine'
import { EDITOR } from '../config/editorKeys'
import { useLibrary } from '../features/library/library.store'
import { useFx } from '../features/fx/fx.store'
import { usePlayer } from '../features/player/player.store'
import { runCommandById } from './commands'
import { describeStep } from './describe'
import { createHistory, pushHistory, redo as redoH, undo as undoH, type History } from './history'
import { clipDur, clipEnd, projectEnd, type Project } from './model'
import * as ops from './ops'
import { computePeaks, type Peaks } from './peaks'
import { renderProject } from './render'
import { loadBuffers } from './schedule'
import { sourceToTimeline, timelineToSource } from './sync'
import { editPlayActions } from './storePlay'
import { editActions } from './storeEdit'
import { projectActions } from './storeProject'
import { rangeActions } from './storeRange'
import { autoActions } from './storeAuto'
import type { Ctx, RenderOpts, S } from './storeTypes'
import { fmtDur, fmtTime } from './timefmt'
import { editorTransport } from './transport'

export type { S, DockTab, Gap, ClipPatch, RenderOpts } from './storeTypes'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const mapHist = (h: History, f: (p: Project) => Project): History => ({ past: h.past.map(f), present: f(h.present), future: h.future.map(f) })
const swapKey = <T,>(o: Record<string, T>, from: string, to: string) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k === from ? to : k, v]))
const swapPath = (p: Project, from: string, to: string): Project => ({
  ...p, song: p.song === from ? to : p.song, sources: swapKey(p.sources, from, to), clips: p.clips.map((c) => (c.src === from ? { ...c, src: to } : c))
})
const loadRenderOpts = (): RenderOpts => {
  try { return { ...EDITOR.render, range: false, ...JSON.parse(localStorage.getItem(EDITOR.renderStorage) || '{}'), } } catch { return { ...EDITOR.render, range: false } }
}

export const useEditor = create<S>((set, get) => {
  let saveTimer: number | undefined, toastTimer: number | undefined, opening = 0, toastId = 0, lastKey = '', lastAt = 0
  const toast = (text: string) => { clearTimeout(toastTimer); set({ toast: { text, id: ++toastId } }); toastTimer = window.setTimeout(() => set({ toast: null }), EDITOR.toastMs) }
  const syncLoop = () => {
    const { loop, markIn, markOut, project } = get()
    editorTransport.setLoop(loop && project ? (markIn !== null && markOut !== null && markOut > markIn ? { a: markIn, b: markOut } : { a: 0, b: projectEnd(project) }) : null)
  }
  const stopPlayback = () => {
    if (get().playing) { const t = editorTransport.pause(); set({ playing: false, playhead: t }) }
    if (get().shuttle) { set({ shuttle: 0 }); editorTransport.setRate(1) }
  }
  // Player <-> editor hand-over: switching view lands on the exact same moment of the song, and keeps playing if it was playing.
  type Entry = { s: number; was: boolean } | null
  const playerPath = () => { const id = usePlayer.getState().cur; return id ? useLibrary.getState().tracks.find((t) => t.id === id)?.path : undefined }
  const playerEntry = (path: string): Entry => (engine.loaded && playerPath() === path ? { s: engine.el.currentTime, was: !engine.el.paused } : null)
  const carryIn = (e: Entry) => {
    const p = get().project; if (!e || !p) return
    const t = sourceToTimeline(p, p.song, e.s, get().playhead)
    if (t === null) { toast('That part of the song is cut out of this edit'); return }
    get().gotoTime(t)
    if (e.was) void get().togglePlay()
  }
  const carryOutInfo = () => { const { project, playing } = get(); return project ? { map: timelineToSource(project, get().now()), song: project.song, was: playing } : null }
  const carryOut = (o: ReturnType<typeof carryOutInfo>) => {
    if (!o || !o.map) return
    const track = useLibrary.getState().tracks.find((t) => t.path === o.map!.src); if (!track) return
    const resume = () => { engine.el.currentTime = o.map!.s; if (o.was) void usePlayer.getState().toggle() }
    if (usePlayer.getState().cur === track.id && engine.loaded) return resume()
    usePlayer.setState({ cur: track.id })                            // load the same song in the player, paused, then jump to the point
    void engine.load(track.path, useFx.getState().fx, false).then(() => { if (engine.el.readyState >= 1) resume(); else engine.el.addEventListener('loadedmetadata', resume, { once: true }) })
  }
  const schedule = () => { clearTimeout(saveTimer); saveTimer = window.setTimeout(() => void get().flush(), EDITOR.autosaveMs) }
  const resync = () => {
    if (get().loop) syncLoop()
    const { playing, project, buffers } = get()
    if (playing && project) editorTransport.seek(project, buffers, editorTransport.position())
  }
  const step = (f: (h: History) => History) => {
    const h = get().hist; if (!h) return
    const n = f(h); if (n === h) return
    lastKey = ''
    const ids = new Set(n.present.clips.map((c) => c.id))
    set({ hist: n, project: n.present, saveState: 'dirty', gap: null, selection: get().selection.filter((id) => ids.has(id)) }); schedule(); resync()
  }
  const edit: Ctx['edit'] = (fn, ok, none = 'Nothing changed') => {
    const before = get().project; if (!before) return false
    get().apply(fn)
    if (get().project === before) { toast(none); return false }
    toast(typeof ok === 'function' ? ok(get()) : ok); return true
  }
  const coalesce: Ctx['coalesce'] = (key, fn) => {
    const { project, hist } = get(); if (!project || !hist) return
    const next = fn(project); if (next === project) return
    const now = performance.now()
    if (lastKey === key && now - lastAt < EDITOR.coalesceMs && hist.past.length) {
      if (JSON.stringify(next) === JSON.stringify(project)) return
      set({ hist: { ...hist, present: next, future: [] }, project: next, saveState: 'dirty' }); lastAt = now; schedule(); resync(); return
    }
    get().apply(() => next)
    if (get().project !== project) { lastKey = key; lastAt = now }
  }
  const targets = () => { const t = get().project?.tracks.filter((x) => x.target).map((x) => x.id); return t?.length ? t : undefined }
  const switchTo: Ctx['switchTo'] = async (p) => {
    stopPlayback()
    const loaded = await loadBuffers(p, editorTransport.ctx)
    const buffers = new Map(get().buffers), peaks = new Map<string, Peaks>(get().peaks)
    loaded.forEach((b, k) => { buffers.set(k, b); if (!peaks.has(k)) peaks.set(k, computePeaks(b)) })
    lastKey = ''
    set({ project: p, hist: createHistory(p), buffers, peaks, selection: [], gap: null, range: null, playhead: 0, saveState: 'saved', markIn: null, markOut: null })
    void get().refreshVersions()
  }
  const ctx: Ctx = { set, get, toast, edit, coalesce, stopPlayback, schedule, resync, switchTo, targets }
  editorTransport.onEnded = () => set({ playing: false, shuttle: 0, playhead: editorTransport.position() })

  return {
    open: false, project: null, hist: null, buffers: new Map(), peaks: new Map(), selection: [], tool: 'select', playhead: 0, playing: false,
    pxPerSec: EDITOR.defaultPxPerSec, scrollX: 0, scrollY: 0, viewWidth: 0, snap: true, markIn: null, markOut: null,
    saveState: 'saved', busy: null, clipboard: [],
    loop: false, gap: null, dockOpen: false, dockTab: 'inspector', toast: null, shuttle: 0, beatSnap: false, showBeats: false, versions: [], renderOpts: loadRenderOpts(), range: null,

    ...editActions(ctx), ...projectActions(ctx), ...rangeActions(ctx), ...autoActions(ctx), ...editPlayActions(ctx, syncLoop),

    async openSong(path) {
      const s = get(), entry = playerEntry(path)
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
        lastKey = ''
        set({
          project, hist: createHistory(project), buffers, peaks, selection: [], gap: null, range: null, playhead: 0, scrollX: 0, scrollY: 0, markIn: null, markOut: null,
          saveState: 'saved', busy: null, tool: 'select', loop: false
        })
        syncLoop(); void get().refreshVersions()
        get().fitToView(get().viewWidth || 1000)
        carryIn(entry)
      } catch (e) {
        console.error('[editor] open failed', path, e); set({ open: false, busy: null }); toast('Could not open')
      }
    },
    show() { const p = get().project; if (!p) return; const entry = playerEntry(p.song); engine.el.pause(); set({ open: true }); carryIn(entry) },
    close() { const out = carryOutInfo(); stopPlayback(); void get().flush(); set({ open: false }); carryOut(out) },
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
      lastKey = ''
      set({ hist: h, project: h.present, saveState: 'dirty', gap: null, selection: get().selection.filter((id) => ids.has(id)) })
      schedule(); resync()
    },
    undo() {
      const h = get().hist; if (!h || !h.past.length) return toast('Nothing to undo')
      const label = describeStep(h.past[h.past.length - 1], h.present); step(undoH); toast(`Undo ${label}`)
    },
    redo() {
      const h = get().hist; if (!h || !h.future.length) return toast('Nothing to redo')
      const label = describeStep(h.present, h.future[0]); step(redoH); toast(`Redo ${label}`)
    },
    jumpHistory(offset) {   // negative = that many undos, positive = that many redos, in ONE state change
      if (!offset) return
      step((h) => { let n = h; for (let i = 0; i < Math.abs(offset); i++) n = offset < 0 ? undoH(n) : redoH(n); return n })
      toast(offset < 0 ? `Back ${-offset} step${offset === -1 ? '' : 's'}` : `Forward ${offset} step${offset === 1 ? '' : 's'}`)
    },

    select(ids, additive) {
      if (!additive) return set({ selection: [...new Set(ids)], gap: null })
      const cur = new Set(get().selection)
      if (ids.length === 1 && cur.has(ids[0])) cur.delete(ids[0]); else ids.forEach((id) => cur.add(id))
      set({ selection: [...cur], gap: null })
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
    toggleSnap() { set({ snap: !get().snap }); toast(get().snap ? 'Snap on' : 'Snap off') },
    async togglePlay() {
      const { project, buffers, playing, playhead } = get(); if (!project) return
      if (playing) { stopPlayback(); return }
      syncLoop()
      const end = projectEnd(project), from = playhead >= end - EDITOR.edgeEps ? 0 : playhead
      set({ playing: true, playhead: from })
      try { await editorTransport.play(project, buffers, from) } catch (e) { console.error('[editor] play failed', e); set({ playing: false }) }
    },

    splitAtPlayhead() {
      const t = get().now(), sel = get().selection, p = get().project; if (!p) return
      const hit = sel.filter((id) => { const c = p.clips.find((x) => x.id === id); return c && t > c.start && t < c.start + clipDur(c) })
      edit((q) => ops.splitAt(q, t, hit.length ? hit : undefined), `Cut at ${fmtTime(t)}`, 'Nothing to cut here')
    },
    splitAllAtPlayhead() { const t = get().now(); edit((q) => ops.splitAt(q, t), `Cut all tracks at ${fmtTime(t)}`, 'Nothing to cut here') },
    resetToOriginal() {
      const dur = get().project ? (get().buffers.get(get().project!.song)?.duration ?? get().project!.sources[get().project!.song]?.duration ?? 0) : 0
      if (!dur) return toast('Nothing to reset')
      if (edit((p) => ({ ...ops.newProject(p.song, dur, p.name), id: p.id }), 'Reset to the original song (undo brings the cuts back)', 'Already original')) set({ selection: [], gap: null })
    },
    deleteSelection(ripple) {
      const ids = get().selection; if (!ids.length) return toast('Select a clip first')
      const n = ids.length
      if (edit((p) => (ripple ? ops.rippleDelete(p, ids) : ops.deleteClips(p, ids)), `${ripple ? 'Ripple deleted' : 'Deleted'} ${n} clip${n > 1 ? 's' : ''}`, 'Clips are locked')) set({ selection: [] })
    },
    selectAtPlayhead() {
      const p = get().project; if (!p) return
      const t = get().now(), ids = p.clips.filter((c) => c.start <= t + 1e-6 && t < clipEnd(c) - 1e-6).map((c) => c.id)
      if (ids.length) { set({ selection: ids, gap: null }); toast(`Selected ${ids.length} clip${ids.length === 1 ? '' : 's'} at the playhead`); return }
      // nothing under the playhead: select the gap there instead (targeted tracks first), ready for D to close it
      const targeted = p.tracks.filter((tr) => tr.target), order = [...targeted, ...p.tracks.filter((tr) => !tr.target)]
      for (const tr of order) {
        const g = ops.gapsOf(p, tr.id).find((x) => x.start <= t + 1e-6 && t < x.end - 1e-6)
        if (g) { set({ gap: { track: tr.id, start: g.start, end: g.end }, selection: [] }); toast(`Gap ${fmtDur(g.end - g.start)} selected: press D to close it`); return }
      }
      set({ selection: [], gap: null }); toast('Nothing at the playhead')
    },
    selectAll() { const n = get().project?.clips.length ?? 0; set({ selection: get().project?.clips.map((c) => c.id) ?? [], gap: null }); toast(`Selected ${n} clip${n === 1 ? '' : 's'}`) },
    copy() {
      const { project, selection } = get()
      if (project && selection.length) { set({ clipboard: project.clips.filter((c) => selection.includes(c.id)) }); toast(`Copied ${selection.length} clip${selection.length > 1 ? 's' : ''}`) } else toast('Select a clip first')
    },
    cut() { if (!get().selection.length) return toast('Select a clip first'); get().copy(); get().deleteSelection(false) },
    paste() {
      const { clipboard, project } = get(); if (!project || !clipboard.length) return toast('Clipboard is empty')
      const before = new Set(project.clips.map((c) => c.id)), t = get().now()
      edit((p) => ops.pasteClips(p, clipboard, t), `Pasted at ${fmtTime(t)}`)
      const added = get().project!.clips.filter((c) => !before.has(c.id)).map((c) => c.id)
      if (added.length) set({ selection: added })
    },
    pasteInsert() {
      const { clipboard, project } = get(); if (!project || !clipboard.length) return toast('Clipboard is empty')
      const before = new Set(project.clips.map((c) => c.id)), t = get().now()
      edit((p) => ops.insertClips(p, clipboard, t), `Inserted at ${fmtTime(t)}`)
      const added = get().project!.clips.filter((c) => !before.has(c.id)).map((c) => c.id)
      if (added.length) set({ selection: added })
    },
    setMark(which, t) {
      set(which === 'in' ? { markIn: t } : { markOut: t }); syncLoop()
      toast(t === null ? `Cleared ${which === 'in' ? 'In' : 'Out'}` : `Mark ${which === 'in' ? 'In' : 'Out'} ${fmtTime(t)}`)
    },
    addMarkerAtPlayhead() { get().markerAt(get().now()) },

    setRenderOpts(o) {
      const n = { ...get().renderOpts, ...o }; set({ renderOpts: n })
      try { localStorage.setItem(EDITOR.renderStorage, JSON.stringify({ bitDepth: n.bitDepth, normalize: n.normalize })) } catch { /* storage may be blocked */ }
    },
    async renderToLibrary() {
      await get().flush()
      const { project, buffers, renderOpts, markIn, markOut } = get(); if (!project || get().busy) return
      const range = renderOpts.range && markIn !== null && markOut !== null && markOut > markIn ? { a: markIn, b: markOut } : undefined
      set({ busy: 'Rendering' })
      try {
        const { channels, rate } = await renderProject(project, buffers, { range, bitDepth: renderOpts.bitDepth, normalize: renderOpts.normalize })
        set({ busy: 'Writing' })
        await window.api.saveRender(project.song, project.name, encodeWav(channels, rate, renderOpts.bitDepth))
        set({ busy: null }); toast(`Rendered ${project.name} to library`)
      } catch (e) { console.error('[editor] render failed', e); set({ busy: null }); toast('Render failed') }
    },
    async renameVersion(name) {
      const { project, hist } = get(), to = name.trim(); if (!project || !hist || !to || to === project.name) return
      await get().flush()
      try { if ((await window.api.editorList(project.song)).includes(project.name)) await window.api.editorRenameVersion(project.song, project.name, to) }
      catch (e) { console.error('[editor] rename version failed', e); return toast('Rename failed') }
      const h = mapHist(hist, (p) => ({ ...p, name: to })); set({ hist: h, project: h.present, saveState: 'dirty' }); schedule()   // rewrite the file so its JSON carries the new name
      toast(`Renamed to ${to}`); void get().refreshVersions()
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
        set({ hist: h, project: h.present, buffers: rekey(buffers), peaks: rekey(peaks) }); toast('Song renamed')
      } catch (e) { console.error('[editor] rename song failed', e); toast('Rename failed') }
    },
    runCommand: (id) => runCommandById(id, get()),
    showToast: toast
  }
})

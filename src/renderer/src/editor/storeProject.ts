import { TRACK_EQ, TRACK_REVERB } from '../config/editorAudio'
import type { TrackFx } from './model'
import type { Fx } from '../../../shared/types'
import { EDITOR } from '../config/editorKeys'
import { uid } from './clipmath'
import * as ops from './ops'
import { computePeaks } from './peaks'
import { loadBuffers } from './schedule'
import type { Ctx, ProjectKeys, S } from './storeTypes'
import { fmtTime } from './timefmt'
import { editorTransport } from './transport'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const uniqueName = (base: string, taken: string[]) => { let n = 2, name = base; while (taken.includes(name)) name = `${base} ${n++}`; return name }

/** Project-level actions: sources, master, BPM, versions, view helpers, dock. */
const clampDb = (v: number) => Math.min(TRACK_EQ.maxDb, Math.max(TRACK_EQ.minDb, v))
/** Merge a slider patch into a track's fx; an all-flat EQ and no reverb collapse to "no fx" so the audio graph stays untouched. */
export function mergeTrackFx(cur: TrackFx | undefined, patch: { low?: number; mid?: number; high?: number; reverb?: Partial<NonNullable<TrackFx['reverb']>> | null }): TrackFx | undefined {
  const rv = patch.reverb === null ? undefined : patch.reverb ? { wet: TRACK_REVERB.defaultWet, decay: TRACK_REVERB.defaultDecay, damping: TRACK_REVERB.defaultDamping, ...cur?.reverb, ...patch.reverb } : cur?.reverb
  const next: TrackFx = { low: clampDb(patch.low ?? cur?.low ?? 0), mid: clampDb(patch.mid ?? cur?.mid ?? 0), high: clampDb(patch.high ?? cur?.high ?? 0), ...(rv ? { reverb: rv } : {}) }
  return !next.low && !next.mid && !next.high && !(next.reverb && next.reverb.wet > 0) ? undefined : next
}

export function projectActions(c: Ctx): Pick<S, ProjectKeys> {
  const { get, set, toast, edit, coalesce, targets, switchTo } = c
  return {
    async insertSource(path, t, track, mode, range) {
      if (!get().project) return
      try {
        let buf = get().buffers.get(path)
        if (!buf) {
          const loaded = await loadBuffers(get().project!, editorTransport.ctx, [path]); buf = loaded.get(path)
          if (!buf) throw new Error('no buffer')
          const buffers = new Map(get().buffers).set(path, buf), peaks = new Map(get().peaks).set(path, computePeaks(buf)); set({ buffers, peaks })
        }
        const dur = buf.duration, a = clamp(range?.in ?? 0, 0, dur), b = clamp(range?.out ?? dur, a, dur)
        const tr = track ?? targets()?.[0] ?? get().project!.tracks[0]?.id; if (!tr) return
        edit((q) => {
          const withSrc = { ...q, sources: { ...q.sources, [path]: { duration: dur } } }
          const clip = ops.clipFromSource(path, dur, a, b, tr, 0)
          return mode === 'insert' ? ops.insertClips(withSrc, [{ ...clip, start: t }], t, tr) : ops.pasteClips(withSrc, [clip], t, tr)
        }, `${mode === 'insert' ? 'Inserted' : 'Overwrote'} ${(b - a).toFixed(1)}s at ${fmtTime(t)}`, 'Nothing to place (track locked?)')
      } catch (e) { console.error('[editor] insertSource failed', path, e); toast('Could not load that audio') }
    },
    /** Per-track EQ and reverb (the track's "FX"). Sliders pass through coalesce so a whole drag is one undo step. */
    setTrackFx(id: string, patch: { low?: number; mid?: number; high?: number; reverb?: Partial<NonNullable<TrackFx['reverb']>> | null }) {
      coalesce(`trackfx:${id}`, (p) => ops.setTrack(p, id, { fx: mergeTrackFx(p.tracks.find((t) => t.id === id)?.fx, patch) }))
    },
    resetTrackFx(id: string) { edit((p) => ops.setTrack(p, id, { fx: undefined }), 'Track effects cleared', 'No effects on this track') },
    applyMaster(fx: Fx | null) { coalesce('master', (p) => ({ ...p, master: fx })); toast(fx ? 'Mix updated' : 'Mix reset') },
    setBpm(bpm, offset) {
      coalesce('bpm', (p) => ({ ...p, bpm, bpmOffset: offset ?? p.bpmOffset }))
      toast(bpm === null ? 'BPM cleared' : `BPM ${Math.round(bpm * 100) / 100}`)
    },
    toggleBeatSnap() { set({ beatSnap: !get().beatSnap }); toast(get().beatSnap ? 'Beat snap on' : 'Beat snap off') },
    toggleShowBeats() { set({ showBeats: !get().showBeats }); toast(get().showBeats ? 'Beat grid shown' : 'Beat grid hidden') },
    setDock: (tab) => set(tab ? { dockOpen: true, dockTab: tab } : { dockOpen: false }),

    fitSelection() {
      const { project, selection, viewWidth } = get(); if (!project) return
      const cs = project.clips.filter((x) => selection.includes(x.id)); if (!cs.length) return toast('Select a clip first')
      const a = Math.min(...cs.map((x) => x.start)), b = Math.max(...cs.map((x) => x.start + (x.srcOut - x.srcIn) / (x.speed || 1)))
      const pps = clamp((viewWidth - EDITOR.fitPadPx) / Math.max(b - a, 0.1), EDITOR.zoomMin, EDITOR.zoomMax)
      set({ pxPerSec: pps, scrollX: Math.max(0, a * pps - EDITOR.fitPadPx / 2) })
    },
    gotoTime(t) {
      const { pxPerSec, scrollX, viewWidth } = get(); get().setPlayhead(t)
      const x = Math.max(0, t) * pxPerSec
      if (x < scrollX + 20 || x > scrollX + viewWidth - 20) set({ scrollX: Math.max(0, x - viewWidth / 2) })
    },

    listVersions: () => get().versions,
    async refreshVersions() {
      const p = get().project; if (!p) return set({ versions: [] })
      let names: string[] = []
      try { names = await window.api.editorList(p.song) } catch { /* keep the list we can build */ }
      const cur = get().project; if (!cur || cur.song !== p.song) return
      set({ versions: names.includes(cur.name) ? names : [cur.name, ...names] })
    },
    async newVersion(name) {
      const p = get().project; if (!p) return
      await get().flush(); await get().refreshVersions()
      const dur = get().buffers.get(p.song)?.duration ?? p.sources[p.song]?.duration ?? 1
      const np = ops.newProject(p.song, dur, name?.trim() || uniqueName('Edit', get().versions))
      try { await window.api.editorSave(p.song, np); await switchTo(np); toast(`New version ${np.name}`) } catch (e) { console.error('[editor] new version failed', e); toast('Could not create version') }
    },
    async duplicateVersion() {
      const p = get().full; if (!p) return   // the whole edit: audio AND pictures
      await get().flush(); await get().refreshVersions()
      const np = { ...p, id: uid('p', []), name: uniqueName(`${p.name} copy`, get().versions) }
      try { await window.api.editorSave(p.song, np); await switchTo(np); toast(`Duplicated as ${np.name}`) } catch (e) { console.error('[editor] duplicate failed', e); toast('Could not duplicate') }
    },
    async openVersion(name) {
      const p = get().project; if (!p || name === p.name) return
      await get().flush()
      try {
        const np = await window.api.editorLoad(p.song, name)
        if (!np) return toast('Version not found')
        await switchTo(np); toast(`Opened ${name}`)
      } catch (e) { console.error('[editor] open version failed', e); toast('Could not open version') }
    },
    async deleteVersion(name) {
      const p = get().project; if (!p) return
      await get().refreshVersions()
      const rest = get().versions.filter((n) => n !== name)
      if (!rest.length) return toast('Cannot delete the only version')
      try {
        if (name === p.name) set({ saveState: 'saved' })   // stop a pending autosave from recreating the file
        else await get().flush()
        await window.api.editorDelete(p.song, name)
        if (name === p.name) { const np = await window.api.editorLoad(p.song, rest[0]); if (np) await switchTo(np) }
        else await get().refreshVersions()
        toast(`Deleted ${name}`)
      } catch (e) { console.error('[editor] delete version failed', e); toast('Could not delete version') }
    }
  }
}

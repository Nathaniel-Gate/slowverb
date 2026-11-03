import { create } from 'zustand'
import type { Fx } from '../../../../../shared/types'
import { PANELS } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import { computePeaks, type Peaks } from '../../peaks'
import { editorTransport } from '../../transport'
import { auditionStart, auditionStop } from './audition'

export type SrcData = { buf: AudioBuffer; peaks: Peaks }
export type Norm = { peakDb: number; rmsDb: number; lufsApprox: number }
type Range = { in: number; out: number }
export type AutoData = { song: string; sections: { t: number; strength: number }[] | null; silences: { start: number; end: number }[] | null }

type S = {
  scope: 'playlist' | 'all'; picked: string | null; ranges: Record<string, Range>; loading: string | null; auditioning: boolean
  norm: Norm | null; normMode: 'peak' | 'rms'; stash: Fx | null; taps: number[]; detecting: boolean; detected: { conf: number } | null
  auto: AutoData | null; autoBusy: 'sections' | 'silence' | null; sens: number; silDb: number; silMin: number
  setScope(s: 'playlist' | 'all'): void
  pick(path: string | null): Promise<SrcData | null>
  setRange(path: string, r: Partial<Range>, duration: number): void
  getRange(path: string, duration: number): Range
  toggleAudition(): void
  stopAudition(): void
  set(p: Partial<S>): void
}

const cache = new Map<string, SrcData>()   // decoded sources the editor does not already hold (small LRU)
export const cachedSource = (path: string): SrcData | null => {
  const ed = useEditor.getState(), buf = ed.buffers.get(path), peaks = ed.peaks.get(path)
  return buf && peaks ? { buf, peaks } : cache.get(path) ?? null
}
async function decode(path: string): Promise<SrcData | null> {
  const hit = cachedSource(path); if (hit) return hit
  try {
    const res = await fetch('media://local' + encodeURI(path)); if (!res.ok) throw new Error(String(res.status))
    const buf = await editorTransport.ctx.decodeAudioData(await res.arrayBuffer()), data = { buf, peaks: computePeaks(buf) }
    cache.set(path, data); while (cache.size > PANELS.sourceCacheMax) cache.delete(cache.keys().next().value as string)
    return data
  } catch (e) { console.error('[panels] source decode failed', path, e); return null }
}

export const usePanels = create<S>((set, get) => ({
  scope: 'playlist', picked: null, ranges: {}, loading: null, auditioning: false,
  norm: null, normMode: PANELS.normMode, stash: null, taps: [], detecting: false, detected: null,
  auto: null, autoBusy: null, sens: PANELS.sectionSensDefault, silDb: PANELS.silenceDb, silMin: PANELS.silenceMinSec,
  setScope: (scope) => set({ scope }),
  async pick(path) {
    get().stopAudition(); set({ picked: path, loading: path }); if (!path) { set({ loading: null }); return null }
    const data = await decode(path)
    if (get().picked === path) set({ loading: null })
    return data
  },
  getRange: (path, duration) => get().ranges[path] ?? { in: 0, out: duration },
  setRange(path, r, duration) {
    const cur = get().getRange(path, duration), min = PANELS.miniWaveMinSec
    let a = Math.max(0, Math.min(r.in ?? cur.in, duration)), b = Math.min(duration, Math.max(r.out ?? cur.out, 0))
    if (r.in !== undefined) a = Math.min(a, b - min); else b = Math.max(b, a + min)
    set({ ranges: { ...get().ranges, [path]: { in: Math.max(0, a), out: Math.min(duration, b) } } })
  },
  toggleAudition() {
    const { picked, auditioning } = get(); if (!picked) return
    if (auditioning) return get().stopAudition()
    const data = cachedSource(picked); if (!data) return
    if (useEditor.getState().playing) void useEditor.getState().togglePlay()   // never two things at once
    const r = get().getRange(picked, data.buf.duration)
    auditionStart(data.buf, r.in, r.out, () => set({ auditioning: false })); set({ auditioning: true })
  },
  stopAudition() { auditionStop(); set({ auditioning: false }) },
  set: (p) => set(p)
}))

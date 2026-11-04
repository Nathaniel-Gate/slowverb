import type { DragEvent as RDragEvent, RefObject } from 'react'
import { TL } from '../../config/timeline'
import { useEditor } from '../editor.store'
import { st, type View } from './dragRunner'
import { useLaneLive } from './laneLive'
import { snapOne } from './timelineDrags'
import { clamp, clipBox, laneAt, layoutOf } from './timelineMath'
import { insertMedia } from '../../clips/insertMedia'

export const SOURCE_MIME = 'application/x-slowverb-source'   // JSON { path, in?, out? }, written by the source bin (agent G2)
const MEDIA_MIME = 'application/x-slowverb-media'           // JSON { path }, written by the Clips media browser (clips/ui/MediaBin.tsx)
/** Audio rows drop in the Editor tab, pictures/videos in the Clips tab (never the other way round). */
const mimeFor = () => (st().view === 'visual' ? MEDIA_MIME : SOURCE_MIME)
const has = (e: RDragEvent) => Array.from(e.dataTransfer.types).includes(mimeFor())

/** Drop a source-bin row onto the lanes: ghost clip while hovering, insertSource() on drop (overwrite; Option = insert). */
export function useDropTarget(view: View, ghost: RefObject<HTMLDivElement | null>) {
  const where = (e: RDragEvent) => {
    const s = st(), p = s.project!, pt = view.point(e.clientX, e.clientY)
    const lay = layoutOf(p.tracks, useLaneLive.getState().live), idx = laneAt(lay, pt.y)
    const t = Math.max(0, snapOne(p, Math.max(0, pt.t), { enabled: s.snap, playhead: s.playhead, pxPerSec: s.pxPerSec, beats: s.beatSnap }).t)
    return { pt, lay, t, lane: clamp(idx, 0, p.tracks.length - 1), below: idx >= p.tracks.length, p }
  }
  const hide = () => { if (ghost.current) ghost.current.style.display = 'none' }

  function onDragOver(e: RDragEvent) {
    if (!has(e) || !st().project) return
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'
    const { pt, lay, t, lane } = where(e), g = ghost.current, s = st()
    const z = TL.autoScrollZonePx, w = view.viewW()
    if (pt.x < z) view.scrollTo(s.scrollX - TL.autoScrollMax * (1 - pt.x / z)); else if (pt.x > w - z) view.scrollTo(s.scrollX + TL.autoScrollMax * (1 - (w - pt.x) / z))
    if (!g) return
    const b = clipBox(lay, lane)
    g.style.display = 'block'
    g.style.transform = `translate(${Math.round(t * s.pxPerSec - s.scrollX)}px, ${b.y}px)`
    g.style.width = `${Math.min(TL.dropGhostSec * s.pxPerSec, w)}px`; g.style.height = `${b.h}px`
    g.dataset.insert = e.altKey ? '1' : '0'
  }
  function onDrop(e: RDragEvent) {
    hide()
    if (!has(e) || !st().project) return
    e.preventDefault()
    let src: { path?: string; in?: number; out?: number } | null = null
    try { src = JSON.parse(e.dataTransfer.getData(mimeFor())) } catch { src = null }
    if (!src?.path) return
    const { t, lane, below, p } = where(e)
    if (st().view === 'visual') { void insertMedia(src.path, t, { track: below ? undefined : p.tracks[lane]?.id, newTrack: below, mode: e.altKey ? 'insert' : 'overwrite' }); return }
    const range = typeof src.in === 'number' && typeof src.out === 'number' && src.out > src.in ? { in: src.in, out: src.out } : undefined
    void useEditor.getState().insertSource(src.path, t, below ? undefined : p.tracks[lane]?.id, e.altKey ? 'insert' : 'overwrite', range)
  }
  return { onDragOver, onDragLeave: hide, onDrop }
}

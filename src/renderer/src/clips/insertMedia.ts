import { mediaKindOf } from '../../../shared/visualsModel'
import { useEditor } from '../editor/editor.store'
import * as ops from '../editor/ops'
import { fmtTime } from '../editor/timefmt'
import { placeMedia, firstVisualTrack } from './opsVisual'
import { probe } from './probe'

/** Put a picture or video on the Clips timeline at t (overwrite, or insert). track undefined = the targeted track, else the top one.
 *  newTrack = put it on a brand-new visual track (the media browser's + button). One undo step. */
export async function insertMedia(path: string, t: number, opts: { track?: string; mode?: 'insert' | 'overwrite'; newTrack?: boolean } = {}): Promise<boolean> {
  const ed = useEditor.getState()
  if (!ed.project || ed.view !== 'visual') return false
  if (!mediaKindOf(path)) { ed.showToast('Only pictures and videos go on the Clips timeline'); return false }
  const info = await probe(path), p0 = useEditor.getState().project; if (!p0) return false
  const before = new Set(p0.clips.map((c) => c.id))
  useEditor.getState().apply((p) => {
    let q = p, track = opts.track
    if (opts.newTrack) { const had = new Set(q.tracks.map((x) => x.id)); q = ops.addTrack(q); track = q.tracks.find((x) => !had.has(x.id))?.id }
    track ??= q.tracks.find((x) => x.target)?.id ?? firstVisualTrack(q)
    return placeMedia(q, path, info, Math.max(0, t), track, opts.mode ?? 'overwrite')
  })
  const added = useEditor.getState().project!.clips.filter((c) => !before.has(c.id)).map((c) => c.id)
  if (!added.length) { useEditor.getState().showToast('Nothing placed (track locked?)'); return false }
  useEditor.setState({ selection: added })
  useEditor.getState().showToast(`${info.kind === 'video' ? 'Video' : 'Picture'} at ${fmtTime(t)}`)
  return true
}

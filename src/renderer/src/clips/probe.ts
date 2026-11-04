import { mediaUrl } from '../../../shared/mediaUrl'
import { mediaKindOf } from '../../../shared/visualsModel'
import { CLIPS } from '../config/clips'
import type { SourceInfo } from '../editor/model'

// Reads what a picture or video is (kind, length, size) by loading it in a detached element. Cached per path.
const cache = new Map<string, Promise<SourceInfo>>()

function probeImage(path: string): Promise<SourceInfo> {
  return new Promise((ok) => {
    const img = new Image()
    img.onload = () => ok({ duration: CLIPS.stillSourceSec, kind: 'image', w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => ok({ duration: CLIPS.stillSourceSec, kind: 'image' })
    img.src = mediaUrl(path)
  })
}
function probeVideo(path: string): Promise<SourceInfo> {
  return new Promise((ok) => {
    const v = document.createElement('video'); v.preload = 'metadata'; v.muted = true
    const done = (info: SourceInfo) => { v.removeAttribute('src'); v.load(); ok(info) }
    v.onloadedmetadata = () => done({ duration: Number.isFinite(v.duration) && v.duration > 0 ? v.duration : CLIPS.videoFallbackSec, kind: 'video', w: v.videoWidth, h: v.videoHeight })
    v.onerror = () => done({ duration: CLIPS.videoFallbackSec, kind: 'video' })
    v.src = mediaUrl(path)
  })
}
/** Kind, length (stills get CLIPS.stillSourceSec) and pixel size of a media file. */
export function probe(path: string): Promise<SourceInfo> {
  let job = cache.get(path)
  if (!job) {
    const kind = mediaKindOf(path)
    job = kind === 'video' ? probeVideo(path) : probeImage(path)
    cache.set(path, job)
  }
  return job
}

import { mediaUrl } from '../../../shared/mediaUrl'
import { CLIPS } from '../config/clips'
import type { Drawable } from './compose'

// Decoded pictures for the preview stage, least recently used dropped first (CLIPS.imageCacheMax).
type Entry = { img: HTMLImageElement; ready: boolean; failed: boolean }
const cache = new Map<string, Entry>()
const waiters = new Set<() => void>()

/** Call fn whenever a picture finishes decoding (the stage redraws). Returns an unsubscribe. */
export function onImageReady(fn: () => void) { waiters.add(fn); return () => { waiters.delete(fn) } }

/** The picture at path, ready to draw, or null while it is still loading (loading starts on the first ask). */
export function imageFor(path: string): Drawable | null {
  let e = cache.get(path)
  if (e) { cache.delete(path); cache.set(path, e) }   // most recent last
  else {
    const img = new Image(); img.decoding = 'async'; img.crossOrigin = 'anonymous'   // media:// sends CORS headers: the stage canvas stays readable
    const entry: Entry = { img, ready: false, failed: false }; e = entry
    img.onload = () => { void img.decode().catch(() => undefined).finally(() => { entry.ready = true; waiters.forEach((w) => w()) }) }
    img.onerror = () => { entry.failed = true }
    img.src = mediaUrl(path)
    cache.set(path, entry)
    while (cache.size > CLIPS.imageCacheMax) cache.delete(cache.keys().next().value!)
  }
  return e.ready ? { el: e.img, w: e.img.naturalWidth, h: e.img.naturalHeight } : null
}
/** Start loading pictures ahead of time (the next few clips) so a cut never shows a blank frame. */
export const preloadImages = (paths: string[]) => paths.forEach((p) => imageFor(p))

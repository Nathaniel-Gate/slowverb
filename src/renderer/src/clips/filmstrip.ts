import { mediaUrl } from '../../../shared/mediaUrl'
import { CLIPS } from '../config/clips'
import { useClips } from './clips.store'
import { hiddenHost } from './videoPool'

// Video filmstrips for the timeline: CLIPS.filmstripFrames frames spread over the whole video, grabbed once with a hidden
// <video> + canvas and cached as small JPEGs in userData/thumbs (keyed by path, length and frame). One video at a time.
let chain: Promise<void> = Promise.resolve()
const started = new Set<string>()
const keyOf = (path: string, dur: number, i: number, n: number) => `film|${path}|${dur.toFixed(3)}|${i}/${n}`
/** Times (source seconds) of the n filmstrip frames of a video of length dur. Pure. */
export const frameTimes = (dur: number, n = CLIPS.filmstripFrames) => Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * dur)

async function grab(path: string, times: number[]): Promise<ArrayBuffer[]> {
  const v = document.createElement('video'); v.muted = true; v.crossOrigin = 'anonymous'; v.preload = 'auto'; v.src = mediaUrl(path)
  hiddenHost().appendChild(v); v.load()
  const timeout = (ms: number) => new Promise<never>((_, bad) => setTimeout(() => bad(new Error('video took too long')), ms))
  try { await Promise.race([new Promise<void>((ok, bad) => { v.onloadeddata = () => ok(); v.onerror = () => bad(new Error('cannot read video')) }), timeout(CLIPS.grabTimeoutMs)]) }
  catch (e) { v.remove(); throw e }
  const h = 90, w = Math.max(1, Math.round(h * (v.videoWidth / Math.max(1, v.videoHeight)))), c = document.createElement('canvas'); c.width = w; c.height = h
  const g = c.getContext('2d')!, out: ArrayBuffer[] = []
  for (const t of times) {
    await Promise.race([new Promise<void>((ok) => { v.onseeked = () => ok(); v.currentTime = Math.min(t, Math.max(0, v.duration - 0.05)) }), timeout(CLIPS.grabTimeoutMs)])
    g.drawImage(v, 0, 0, w, h)
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, 'image/jpeg', CLIPS.frameJpegQ))
    out.push(blob ? await blob.arrayBuffer() : new ArrayBuffer(0))
  }
  v.removeAttribute('src'); v.load(); v.remove()
  return out
}

/** Make sure a video's filmstrip exists (from cache, or grabbed now) and is in the clips store. */
export function ensureFilmstrip(path: string, dur: number): Promise<void> {
  if (started.has(path) || !(dur > 0)) return chain
  started.add(path)
  chain = chain.then(async () => {
    const times = frameTimes(dur), keys = times.map((_, i) => keyOf(path, dur, i, times.length))
    try {
      let files = await Promise.all(keys.map((k) => window.api.frameGet(k)))
      if (files.some((f) => !f)) {
        const jpegs = await grab(path, times)
        files = await Promise.all(jpegs.map((b, i) => (b.byteLength ? window.api.framePut(keys[i], b) : Promise.resolve(null))))
      }
      const urls = files.filter((f): f is string => !!f).map((f) => mediaUrl(f))
      if (urls.length) useClips.getState().setFrames(path, urls)
    } catch (e) { console.warn('[clips] filmstrip failed', path, e) }
  })
  return chain
}

import { mediaUrl } from '../../../shared/mediaUrl'
import { CLIPS } from '../config/clips'
import { clipEnd, clipSpeed, type Clip, type Project } from '../editor/model'
import { editorTransport } from '../editor/transport'
import type { Drawable, Layer } from './compose'

// Hidden <video> elements for the video clips around the playhead, one per clip, kept in step with the song (the master clock).
// Playing: each video plays at clip speed x the song's version speed and is re-seeked only when it drifts past CLIPS.driftSec.
// Paused / scrubbing: each video is seeked to the exact frame and the stage redraws when the frame arrives.
// A clip with "include audio" sends the video's own sound into the editor's audio context; every other video stays silent.
type Slot = { v: HTMLVideoElement; clip: string; src: string; sound?: { node: MediaElementAudioSourceNode; gain: GainNode } }

/** Where a video should be (source seconds) at timeline t: clamped inside the clip's source span. Pure. */
export function expectedTime(c: Clip, t: number): number {
  const s = c.srcIn + Math.max(0, t - c.start) * clipSpeed(c)
  return Math.min(Math.max(c.srcIn, s), Math.max(c.srcIn, c.srcOut - 1 / 60))
}
/** Playback rate for a video that is `drift` seconds ahead (+) or behind (-): small drifts are closed smoothly by playing a little
 *  slower or faster (no visible jump); big ones are re-seeked by the caller. Pure. */
export function trimmedRate(base: number, drift: number): number {
  const k = Math.abs(drift) > CLIPS.trimFromSec ? Math.min(CLIPS.trimMax, Math.max(-CLIPS.trimMax, -drift * CLIPS.trimGain)) : 0
  return Math.min(16, Math.max(0.0625, base * (1 + k)))
}
/** Should a playing video be re-seeked? Pure. */
export const drifted = (actual: number, expected: number, limit = CLIPS.driftSec) => Math.abs(actual - expected) > limit

let host: HTMLDivElement | null = null
/** An invisible 1px box the pooled videos live in (in the page, so they load and decode, but never seen or clickable). */
export function hiddenHost() {
  if (!host) { host = document.createElement('div'); host.setAttribute('aria-hidden', 'true'); host.style.cssText = 'position:fixed;left:-2px;top:-2px;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none'; document.body.appendChild(host) }
  return host
}

export class VideoPool {
  private slots = new Map<string, Slot>()
  onFrame?: () => void            // a seek finished or a frame decoded: the stage should redraw
  seeks = 0                       // diagnostics for the harness: re-seeks done while playing
  get size() { return this.slots.size }

  drawable(l: Layer): Drawable | null {
    const s = this.slots.get(l.clip.id)
    return s && s.v.readyState >= 2 && s.v.videoWidth ? { el: s.v, w: s.v.videoWidth, h: s.v.videoHeight } : null
  }
  element(clipId: string) { return this.slots.get(clipId)?.v }

  private make(c: Clip): Slot {
    const v = document.createElement('video')
    v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto'; (v as HTMLVideoElement & { preservesPitch: boolean }).preservesPitch = false
    v.src = mediaUrl(c.src); hiddenHost().appendChild(v); v.load()   // detached, never-played videos may not load at all: park them in the page, out of sight
    const redraw = () => this.onFrame?.()
    v.addEventListener('seeked', redraw); v.addEventListener('loadeddata', redraw)
    return { v, clip: c.id, src: c.src }
  }
  private drop(id: string) {
    const s = this.slots.get(id); if (!s) return
    s.v.pause(); s.sound?.node.disconnect(); s.sound?.gain.disconnect(); s.v.removeAttribute('src'); s.v.load(); s.v.remove(); this.slots.delete(id)
  }
  private route(s: Slot, on: boolean) {
    if (on && !s.sound) {   // once routed through Web Audio an element stays routed, so this only happens for clips that asked for sound
      const ctx = editorTransport.ctx, node = ctx.createMediaElementSource(s.v), gain = ctx.createGain()
      node.connect(gain).connect(ctx.destination); s.sound = { node, gain }
    }
    if (s.sound) s.sound.gain.gain.value = on ? 1 : 0
    s.v.muted = !on
  }

  /** Bring every video near t into line. rate = the song version's speed (timeline seconds per real second). */
  sync(p: Project, t: number, playing: boolean, rate: number) {
    const hidden = new Set(p.tracks.filter((x) => x.kind === 'visual' && x.mute).map((x) => x.id)), anySolo = p.tracks.some((x) => x.kind === 'visual' && x.solo)
    const solo = new Set(p.tracks.filter((x) => x.solo).map((x) => x.id))
    const near = p.clips.filter((c) => p.sources[c.src]?.kind === 'video' && !c.disabled && !hidden.has(c.track) && (!anySolo || solo.has(c.track))
      && c.start - CLIPS.preloadSec <= t && t < clipEnd(c))
    const keep = new Set(near.map((c) => c.id))
    for (const id of [...this.slots.keys()]) if (!keep.has(id)) this.drop(id)
    for (const c of near.slice(0, CLIPS.videoPoolMax)) {
      let s = this.slots.get(c.id)
      if (s && s.src !== c.src) { this.drop(c.id); s = undefined }
      if (!s) { s = this.make(c); this.slots.set(c.id, s) }
      const v = s.v, want = expectedTime(c, t), live = playing && t >= c.start
      this.route(s, live && !!c.audio)
      if (live) {
        const d = v.currentTime - want, r = trimmedRate(clipSpeed(c) * rate, v.paused ? 0 : d)
        if (Math.abs(v.playbackRate - r) > 1e-3) v.playbackRate = r
        if (v.paused) { v.currentTime = want; void v.play().catch(() => undefined) }
        else if (drifted(v.currentTime, want) && !v.seeking) { v.currentTime = want; this.seeks++ }
      } else {
        if (!v.paused) v.pause()
        if (!v.seeking && Math.abs(v.currentTime - want) > CLIPS.seekToleranceSec) v.currentTime = want
      }
    }
  }
  clear() { for (const id of [...this.slots.keys()]) this.drop(id) }
}
export const videoPool = new VideoPool()

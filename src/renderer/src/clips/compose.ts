import { CLIPS } from '../config/clips'
import { clipDur, clipEnd, clipSpeed, type Clip, type MediaKind, type Project, type VisualFit } from '../editor/model'
import { envGainAt, fadeGain } from '../editor/schedule'

// The Clips tab compositor, split in two: layersAt() is pure maths (what is visible at time t, how opaque, how big, which video
// frame) and paint() draws those layers on a 2D canvas. Bottom track first, top track last (the top lane is in front).
// Visual meaning of the editor's audio ideas: gain = opacity, fades = fade from/to black (or into what is underneath),
// a crossfade between two clips on one track = a dissolve, the volume line = an opacity line, mute = hidden, solo = only these.

export type Layer = { clip: Clip; src: string; kind: MediaKind; alpha: number; scale: number; srcTime: number; fit: VisualFit }

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const EPS = 1e-9

/** Visible layers at timeline second t, back to front. Only visual tracks are considered (pass the full project or the Clips slice). */
export function layersAt(p: Project, t: number): Layer[] {
  const tracks = p.tracks.filter((tr) => tr.kind === 'visual')
  const anySolo = tracks.some((tr) => tr.solo), out: Layer[] = []
  for (let i = tracks.length - 1; i >= 0; i--) {
    const tr = tracks[i]
    if (tr.mute || (anySolo && !tr.solo)) continue
    const on = p.clips.filter((c) => c.track === tr.id && !c.disabled && p.sources[c.src]?.kind && c.start <= t + EPS && t < clipEnd(c) - EPS)
      .sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))
    for (const c of on) {
      const later = on.find((o) => o !== c && o.start > c.start + EPS && o.start < clipEnd(c) - EPS)   // crossfade partner overlapping my tail
      const a = clipAlpha(c, t, !!later) * clamp01(tr.gain)
      if (a <= 0.001) continue
      const local = t - c.start, d = clipDur(c)
      out.push({ clip: c, src: c.src, kind: p.sources[c.src].kind!, alpha: clamp01(a), scale: 1 + Math.max(0, c.zoom ?? 0) * clamp01(local / d), srcTime: c.srcIn + local * clipSpeed(c), fit: c.fit ?? CLIPS.defaultFit })
    }
  }
  return out
}

/** Opacity of one clip at t: gain (capped at 1) x opacity line x fades. In a dissolve the outgoing clip stays solid under the
 *  incoming one (its fade-out is skipped while overlapped), so the picture never dips to black halfway through. */
export function clipAlpha(c: Clip, t: number, overlappedTail = false): number {
  const local = t - c.start, d = clipDur(c)
  let a = clamp01(c.gain) * Math.max(0, envGainAt(c.env, local))
  if (c.fadeIn > EPS && local < c.fadeIn) a *= fadeGain('in', local / c.fadeIn, c.fadeInCurve ?? 'pow')
  if (!overlappedTail && c.fadeOut > EPS && local > d - c.fadeOut) a *= fadeGain('out', (local - (d - c.fadeOut)) / c.fadeOut, c.fadeOutCurve ?? 'pow')
  return clamp01(a)
}

/** Where a picture of size sw x sh lands on a W x H stage. cover fills (cropping), contain fits whole (bars). scale zooms around the centre. */
export function fitRect(sw: number, sh: number, W: number, H: number, fit: VisualFit, scale = 1): { x: number; y: number; w: number; h: number } {
  if (!(sw > 0 && sh > 0)) return { x: 0, y: 0, w: W, h: H }
  const k = (fit === 'cover' ? Math.max(W / sw, H / sh) : Math.min(W / sw, H / sh)) * scale
  const w = sw * k, h = sh * k
  return { x: (W - w) / 2, y: (H - h) / 2, w, h }
}

/** Something drawable with a natural size (an image, a decoded bitmap or a video element). */
export type Drawable = { el: CanvasImageSource; w: number; h: number }
/** Draw the layers on a 2D context of W x H. Layers whose picture is not ready yet are skipped (the caller redraws when it arrives). */
export function paint(g: CanvasRenderingContext2D, W: number, H: number, layers: Layer[], get: (l: Layer) => Drawable | null, bg = CLIPS.stageBg) {
  g.globalAlpha = 1; g.fillStyle = bg; g.fillRect(0, 0, W, H)
  let drawn = 0
  for (const l of layers) {
    const d = get(l); if (!d) continue
    const r = fitRect(d.w, d.h, W, H, l.fit, l.scale)
    g.globalAlpha = l.alpha; g.drawImage(d.el, r.x, r.y, r.w, r.h); drawn++
  }
  g.globalAlpha = 1
  return drawn
}

/** Stage size in px for an aspect inside a box (largest that fits). */
export function stageSize(aspect: string, boxW: number, boxH: number): { w: number; h: number } {
  const [a, b] = aspect.split(':').map(Number), r = a > 0 && b > 0 ? a / b : 16 / 9
  const w = Math.min(boxW, boxH * r)
  return { w: Math.max(0, Math.floor(w)), h: Math.max(0, Math.floor(w / r)) }
}

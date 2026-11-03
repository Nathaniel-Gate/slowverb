import type { Fx } from '../../../shared/types'
import { buildChain } from '../audio/chain'
import { DEFAULT_FX } from '../config/fx'
import { EDITOR_AUDIO, type FadeCurve } from '../config/editorAudio'
import { clipEnd, projectEnd, type Project } from './model'

export type Buffers = Map<string, AudioBuffer>

/** Pure fade maths. Gain of a fade at fraction x (0..1 through the fade). 'in' rises 0->1, 'out' falls 1->0. */
export function fadeGain(dir: 'in' | 'out', x: number, curve: FadeCurve = EDITOR_AUDIO.fadeCurve): number {
  const u = Math.min(1, Math.max(0, dir === 'in' ? x : 1 - x))
  return curve === 'linear' ? u : Math.sin(u * Math.PI / 2)
}
/** n automation points sampled from fraction f0 to f1 of a fade (a partial window when playback starts mid-fade). */
export function fadeCurve(dir: 'in' | 'out', n: number, f0 = 0, f1 = 1, curve: FadeCurve = EDITOR_AUDIO.fadeCurve): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => fadeGain(dir, f0 + (f1 - f0) * i / (n - 1), curve))
}

// Decoded buffers are cached per context so re-opening / re-rendering never re-decodes.
const cache = new WeakMap<BaseAudioContext, Map<string, Promise<AudioBuffer>>>()
export async function loadBuffers(p: Project, ctx: BaseAudioContext, only?: string[]): Promise<Buffers> {
  const paths = only ?? [...new Set([...Object.keys(p.sources), ...p.clips.map((c) => c.src)])]
  const mine = cache.get(ctx) ?? new Map<string, Promise<AudioBuffer>>(); cache.set(ctx, mine)
  const out: Buffers = new Map()
  await Promise.all(paths.map(async (path) => {
    let job = mine.get(path)
    if (!job) {
      job = fetch('media://local' + encodeURI(path)).then((r) => {
        if (!r.ok) throw new Error(`cannot read ${path} (${r.status})`)
        return r.arrayBuffer()
      }).then((b) => ctx.decodeAudioData(b))
      mine.set(path, job); job.catch(() => mine.delete(path))
    }
    out.set(path, await job)
  }))
  return out
}

export type Graph = { endCtxTime: number; stop(): void; out: GainNode }

/** ONE graph for live playback and offline render. Timeline second `fromSec` plays at ctx time `atCtxTime`; the master
 *  speed compresses ctx time (k = 1/speed) and drives each source's playbackRate. Every clip: source -> fadeIn ->
 *  fadeOut -> clip gain -> track gain -> master input -> buildChain (speed/reverb of p.master) -> destination.
 *  rampIn (live seeks only) fades the whole output in to hide the click. */
export function buildGraph(ctx: BaseAudioContext, p: Project, buffers: Buffers, fromSec: number, atCtxTime: number, opts: { rampIn?: number } = {}): Graph {
  const fx: Fx = p.master ?? DEFAULT_FX
  const k = 1 / Math.max(fx.speed, EDITOR_AUDIO.minSpeed), n = EDITOR_AUDIO.curvePoints
  const input = ctx.createGain(), chain = buildChain(ctx, input); chain.apply(fx)
  if (opts.rampIn) { chain.out.gain.setValueAtTime(0, atCtxTime); chain.out.gain.linearRampToValueAtTime(1, atCtxTime + opts.rampIn) }
  const anySolo = p.tracks.some((t) => t.solo)
  const trackGains = new Map<string, GainNode>(), sources: AudioBufferSourceNode[] = []
  const ctxAt = (t: number) => atCtxTime + (t - fromSec) * k

  for (const clip of p.clips) {
    const track = p.tracks.find((t) => t.id === clip.track), buf = buffers.get(clip.src)
    if (!track || !buf || track.mute || (anySolo && !track.solo)) continue
    const start = clip.start, end = clipEnd(clip), a = Math.max(start, fromSec)
    if (end <= a) continue
    let tg = trackGains.get(track.id)
    if (!tg) { tg = ctx.createGain(); tg.gain.value = track.gain; tg.connect(input); trackGains.set(track.id, tg) }
    const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = fx.speed
    const fIn = ctx.createGain(), fOut = ctx.createGain(), cg = ctx.createGain(); cg.gain.value = clip.gain
    src.connect(fIn).connect(fOut).connect(cg).connect(tg)
    const fade = (node: GainNode, dir: 'in' | 'out', w0: number, w1: number, len: number) => {
      const from = Math.max(w0, a)           // the part of the fade window still ahead of the start point
      if (len <= 0 || (w1 - from) * k < EDITOR_AUDIO.minFadeSec) return
      const c = fadeCurve(dir, n, (from - w0) / len, 1)
      if (dir === 'in') node.gain.value = c[0]
      node.gain.setValueCurveAtTime(c, ctxAt(from), (w1 - from) * k)
    }
    fade(fIn, 'in', start, start + clip.fadeIn, clip.fadeIn)
    fade(fOut, 'out', end - clip.fadeOut, end, clip.fadeOut)
    src.start(ctxAt(a), clip.srcIn + (a - start), end - a)
    sources.push(src)
  }

  let stopped = false
  return {
    out: chain.out,
    endCtxTime: ctxAt(Math.max(fromSec, projectEnd(p))),
    stop() {
      if (stopped) return; stopped = true
      if (ctx instanceof OfflineAudioContext) { sources.forEach((s) => { try { s.stop() } catch { /* not started */ } }); return }
      const now = ctx.currentTime, d = EDITOR_AUDIO.declick, g = chain.out.gain
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + d)
      sources.forEach((s) => { try { s.stop(now + d) } catch { /* not started */ } })
      setTimeout(() => chain.out.disconnect(), d * 1000 + 50)
    }
  }
}

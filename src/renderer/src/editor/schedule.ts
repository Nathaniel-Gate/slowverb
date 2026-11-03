import type { Fx } from '../../../shared/types'
import { buildChain } from '../audio/chain'
import { DEFAULT_FX } from '../config/fx'
import { EDITOR_AUDIO, type FadeCurve } from '../config/editorAudio'
import { clipEnd, clipSpeed, projectEnd, type Project } from './model'

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
export type GraphOpts = {
  rampIn?: number          // seconds: whole output fades in (live seeks, loop seams, grains)
  rampOut?: number         // seconds: whole output fades out ending at endCtxTime (needs `until`)
  rate?: number            // extra rate on top of master speed (shuttle), magnitude only
  reverse?: boolean        // play the timeline BACKWARDS from fromSec using reversed buffers
  until?: number           // forward only: timeline second playback stops at (loop end, play range, scrub grain)
  bare?: boolean           // skip master speed + reverb chain (scrub grains)
}

// Reversed copies for reverse shuttle, made lazily once per source buffer.
const reversed = new WeakMap<AudioBuffer, AudioBuffer>()
export function reversedOf(buf: AudioBuffer): AudioBuffer {
  let r = reversed.get(buf)
  if (!r) {
    r = new AudioBuffer({ length: buf.length, numberOfChannels: buf.numberOfChannels, sampleRate: buf.sampleRate })
    for (let c = 0; c < buf.numberOfChannels; c++) r.copyToChannel(Float32Array.from(buf.getChannelData(c)).reverse(), c)
    reversed.set(buf, r)
  }
  return r
}

/** Pure: the slice of a fade window w0..w1 (timeline seconds) still ahead of the play point, for a clip active on lo..hi.
 *  Forward plays lo -> up, reverse hi -> down. Returns the timeline span [t0, t1], where it begins in ctx terms
 *  (`at`: t0 forward, t1 reverse) and the fade fractions fa -> fb to sample. null when nothing is left of the window. */
export function fadeSegment(w0: number, w1: number, lo: number, hi: number, reverse: boolean, minLen = 0) {
  const len = w1 - w0
  if (len <= 0) return null
  const t0 = reverse ? w0 : Math.max(w0, lo), t1 = reverse ? Math.min(w1, hi) : w1
  if (t1 - t0 < minLen || t1 <= t0) return null
  return { t0, t1, at: reverse ? t1 : t0, fa: reverse ? (t1 - w0) / len : (t0 - w0) / len, fb: reverse ? 0 : 1 }
}

/** ONE graph for live playback and offline render. Timeline second `fromSec` plays at ctx time `atCtxTime`; master speed
 *  (and shuttle rate) compress ctx time (k = 1/factor) and drive each source's playbackRate x clip.speed. Every clip:
 *  source -> fadeIn -> fadeOut -> clip gain -> track gain -> master input -> buildChain (speed/reverb of p.master) -> destination.
 *  Disabled clips are skipped. Same-track crossfade overlaps need nothing special: each clip owns its fade curves. */
export function buildGraph(ctx: BaseAudioContext, p: Project, buffers: Buffers, fromSec: number, atCtxTime: number, opts: GraphOpts = {}): Graph {
  const fx: Fx = p.master ?? DEFAULT_FX, rev = !!opts.reverse, n = EDITOR_AUDIO.curvePoints
  const factor = (opts.bare ? 1 : Math.max(fx.speed, EDITOR_AUDIO.minSpeed)) * Math.max(opts.rate ?? 1, EDITOR_AUDIO.shuttleMin), k = 1 / factor
  const input = ctx.createGain()
  let out: GainNode
  if (opts.bare) { out = ctx.createGain(); input.connect(out).connect(ctx.destination) }
  else { const chain = buildChain(ctx, input); chain.apply(fx); out = chain.out }
  const limit = rev ? Infinity : opts.until ?? Infinity
  const ctxAt = (t: number) => atCtxTime + Math.abs(t - fromSec) * k
  const endT = rev ? 0 : Math.max(fromSec, Math.min(limit, projectEnd(p)))
  const endCtxTime = ctxAt(endT)
  if (opts.rampIn) { out.gain.setValueAtTime(0, atCtxTime); out.gain.linearRampToValueAtTime(1, atCtxTime + opts.rampIn) }
  if (opts.rampOut && endCtxTime - opts.rampOut > atCtxTime) { out.gain.setValueAtTime(1, endCtxTime - opts.rampOut); out.gain.linearRampToValueAtTime(0, endCtxTime) }
  const anySolo = p.tracks.some((t) => t.solo)
  const trackGains = new Map<string, GainNode>(), sources: AudioBufferSourceNode[] = []

  for (const clip of p.clips) {
    const track = p.tracks.find((t) => t.id === clip.track), buf0 = buffers.get(clip.src)
    if (clip.disabled || !track || !buf0 || track.mute || (anySolo && !track.solo)) continue
    const s = clipSpeed(clip), start = clip.start, end = clipEnd(clip)
    const lo = rev ? start : Math.max(start, fromSec), hi = rev ? Math.min(end, fromSec) : Math.min(end, limit)
    if (hi <= lo) continue
    let tg = trackGains.get(track.id)
    if (!tg) { tg = ctx.createGain(); tg.gain.value = track.gain; tg.connect(input); trackGains.set(track.id, tg) }
    const src = ctx.createBufferSource(); src.buffer = rev ? reversedOf(buf0) : buf0; src.playbackRate.value = factor * s
    const fIn = ctx.createGain(), fOut = ctx.createGain(), cg = ctx.createGain(); cg.gain.value = clip.gain
    src.connect(fIn).connect(fOut).connect(cg).connect(tg)
    const fade = (node: GainNode, dir: 'in' | 'out', w0: number, w1: number) => {
      const seg = fadeSegment(w0, w1, lo, hi, rev, EDITOR_AUDIO.minFadeSec / k)
      if (!seg) return
      const c = fadeCurve(dir, n, seg.fa, seg.fb)
      node.gain.value = c[0]
      node.gain.setValueCurveAtTime(c, ctxAt(seg.at), (seg.t1 - seg.t0) * k)
    }
    fade(fIn, 'in', start, start + clip.fadeIn)
    fade(fOut, 'out', end - clip.fadeOut, end)
    const tA = rev ? hi : lo, srcAt = clip.srcIn + (tA - start) * s
    // start(when, offset, duration): offset and duration are in SOURCE seconds (duration is not stretched by playbackRate)
    src.start(ctxAt(tA), rev ? buf0.length / buf0.sampleRate - srcAt : srcAt, (hi - lo) * s)
    sources.push(src)
  }

  let stopped = false
  return {
    out, endCtxTime,
    stop() {
      if (stopped) return; stopped = true
      if (ctx instanceof OfflineAudioContext) { sources.forEach((x) => { try { x.stop() } catch { /* not started */ } }); return }
      const now = ctx.currentTime, d = EDITOR_AUDIO.declick, g = out.gain
      g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + d)
      sources.forEach((x) => { try { x.stop(now + d) } catch { /* not started */ } })
      setTimeout(() => out.disconnect(), d * 1000 + 50)
    }
  }
}

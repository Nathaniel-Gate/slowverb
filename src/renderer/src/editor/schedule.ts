import type { Fx } from '../../../shared/types'
import { buildChain } from '../audio/chain'
import { DEFAULT_FX } from '../config/fx'
import { EDITOR_AUDIO, type FadeCurve } from '../config/editorAudio'
import { clipDur, clipEnd, clipSpeed, projectEnd, type Clip, type EnvPoint, type Project } from './model'

export type Buffers = Map<string, AudioBuffer>

/** Pure fade maths. Gain of a fade at fraction x (0..1 through the fade). 'in' rises 0->1, 'out' falls 1->0.
 *  lin = straight line, pow = equal power (quarter sine), log = straight line in dB (config logFadeDb, ends pinned to 0 and 1),
 *  s = raised cosine (soft at both ends). Legacy names 'linear' / 'equalPower' still work. */
export type CurveName = FadeCurve | 'linear' | 'equalPower'
export function fadeGain(dir: 'in' | 'out', x: number, curve: CurveName = EDITOR_AUDIO.fadeCurve): number {
  const u = Math.min(1, Math.max(0, dir === 'in' ? x : 1 - x))
  switch (curve) {
    case 'lin': case 'linear': return u
    case 's': return 0.5 - 0.5 * Math.cos(u * Math.PI)
    case 'log': { const f = 10 ** (-EDITOR_AUDIO.logFadeDb / 20); return u <= 0 ? 0 : (10 ** (-EDITOR_AUDIO.logFadeDb * (1 - u) / 20) - f) / (1 - f) }
    default: return Math.sin(u * Math.PI / 2)
  }
}
/** n automation points sampled from fraction f0 to f1 of a fade (a partial window when playback starts mid-fade). */
export function fadeCurve(dir: 'in' | 'out', n: number, f0 = 0, f1 = 1, curve: CurveName = EDITOR_AUDIO.fadeCurve): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => fadeGain(dir, f0 + (f1 - f0) * i / (n - 1), curve))
}

/** Pure: volume envelope gain at clip time t (seconds from clip start). 1 with no points, held flat before the first and after the last point. */
export function envGainAt(env: EnvPoint[] | undefined, t: number): number {
  if (!env?.length) return 1
  if (t <= env[0].t) return env[0].g
  const last = env[env.length - 1]
  if (t >= last.t) return last.g
  let i = 1; while (env[i].t < t) i++
  const a = env[i - 1], b = env[i]
  return b.t === a.t ? b.g : a.g + (b.g - a.g) * (t - a.t) / (b.t - a.t)
}
/** Pure: automation knots (clip time, gain) covering clip time lo..hi: both ends at their interpolated value, every point between kept. */
export function envKnots(env: EnvPoint[], lo: number, hi: number): EnvPoint[] {
  return [{ t: lo, g: envGainAt(env, lo) }, ...env.filter((e) => e.t > lo && e.t < hi), { t: hi, g: envGainAt(env, hi) }]
}

const seam = (a: Clip, b: Clip) => a.track === b.track && a.src === b.src && !a.disabled && !b.disabled && clipSpeed(a) === clipSpeed(b) &&
  Math.abs(clipEnd(a) - b.start) < EDITOR_AUDIO.contiguousEps && Math.abs(a.srcOut - b.srcIn) < EDITOR_AUDIO.contiguousEps
/** Pure: the two fade windows a clip really gets. The user's fade (with its curve) wins when at least as long as the smooth-cut
 *  micro-fade; otherwise a linear micro-fade of config smoothCutSec is used, except where the edge needs none: a split that is
 *  still one unbroken stretch of the same source, or the source file's own start/end. Project.smoothCuts defaults ON. */
export function edgeFades(p: Project, c: Clip, srcDur: number) {
  const E = EDITOR_AUDIO, on = p.smoothCuts !== false, half = clipDur(c) / 2
  const micro = (natural: boolean, joined: boolean) => on && !natural && !joined ? Math.min(E.smoothCutSec, half) : 0
  const mi = micro(c.srcIn <= E.naturalEdgeEps, p.clips.some((o) => o !== c && seam(o, c)))
  const mo = micro(c.srcOut >= srcDur - E.naturalEdgeEps, p.clips.some((o) => o !== c && seam(c, o)))
  return {
    inSec: Math.max(c.fadeIn, mi), inCurve: c.fadeIn >= mi ? c.fadeInCurve ?? E.fadeCurve : 'lin' as FadeCurve,
    outSec: Math.max(c.fadeOut, mo), outCurve: c.fadeOut >= mo ? c.fadeOutCurve ?? E.fadeCurve : 'lin' as FadeCurve,
  }
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
 *  source -> fadeIn -> fadeOut -> [envelope] -> clip gain -> track gain -> master input -> buildChain (speed/reverb of p.master) -> destination.
 *  Fades use the clip's curve (edgeFades also adds the smooth-cut micro-fades); the envelope (clip.env) is gain automation in timeline time.
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
    const ef = edgeFades(p, clip, buf0.length / buf0.sampleRate)
    src.connect(fIn).connect(fOut)
    if (clip.env?.length) {
      const ev = ctx.createGain(), ks = envKnots(clip.env, lo - start, hi - start).map((e) => ({ at: ctxAt(start + e.t), g: e.g }))
      if (rev) ks.reverse()
      ev.gain.value = ks[0].g; ev.gain.setValueAtTime(ks[0].g, ks[0].at)
      for (const e of ks.slice(1)) ev.gain.linearRampToValueAtTime(e.g, e.at)
      fOut.connect(ev).connect(cg)
    } else fOut.connect(cg)
    cg.connect(tg)
    const fade = (node: GainNode, dir: 'in' | 'out', w0: number, w1: number, curve: FadeCurve) => {
      const seg = fadeSegment(w0, w1, lo, hi, rev, EDITOR_AUDIO.minFadeSec / k)
      if (!seg) return
      const c = fadeCurve(dir, w1 - w0 < 0.02 ? EDITOR_AUDIO.microCurvePoints : n, seg.fa, seg.fb, curve)
      node.gain.value = c[0]
      node.gain.setValueCurveAtTime(c, ctxAt(seg.at), (seg.t1 - seg.t0) * k)
    }
    fade(fIn, 'in', start, start + ef.inSec, ef.inCurve)
    fade(fOut, 'out', end - ef.outSec, end, ef.outCurve)
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

import { encodeWav, type BitDepth } from '../audio/wav'
import { DEFAULT_FX, REVERB } from '../config/fx'
import { EDITOR_AUDIO } from '../config/editorAudio'
import { projectEnd, type Project } from './model'
import { buildGraph, type Buffers } from './schedule'

export type RenderOpts = { range?: { a: number; b: number }; bitDepth?: BitDepth; normalize?: boolean }

/** Pure: scale channels in place so the loudest sample hits `targetDb` dBFS. Returns the linear gain applied (1 for silence). */
export function normalizeChannels(channels: Float32Array[], targetDb = EDITOR_AUDIO.normalizeDb): number {
  let peak = 0
  for (const ch of channels) for (let i = 0; i < ch.length; i++) { const v = Math.abs(ch[i]); if (v > peak) peak = v }
  if (peak < 1e-9) return 1
  const g = 10 ** (targetDb / 20) / peak
  for (const ch of channels) for (let i = 0; i < ch.length; i++) ch[i] *= g
  return g
}

/** Faster-than-real-time mixdown through the SAME buildGraph the live transport uses.
 *  Length = (range or whole project) / speed + reverb tail. Rate = the highest source rate (no resampling for the usual single-rate case).
 *  opts.range renders only timeline a..b; opts.normalize scales the peak to config normalizeDb; bitDepth is echoed for encodeWav. */
export async function renderProject(p: Project, buffers: Buffers, opts: RenderOpts = {}): Promise<{ channels: Float32Array[]; rate: number; bitDepth: BitDepth; gain: number }> {
  const fx = p.master ?? DEFAULT_FX, total = projectEnd(p)
  const a = Math.max(0, Math.min(opts.range?.a ?? 0, total)), b = Math.max(a, Math.min(opts.range?.b ?? total, total))
  const used = p.clips.map((c) => buffers.get(c.src)).filter((x): x is AudioBuffer => !!x)
  const rate = used.reduce((m, x) => Math.max(m, x.sampleRate), 0) || EDITOR_AUDIO.defaultRate
  const tail = fx.wet > 0 ? fx.decay + REVERB.preDelay : 0
  const length = Math.max(1, Math.ceil(((b - a) / Math.max(fx.speed, EDITOR_AUDIO.minSpeed) + tail) * rate - 1e-6))
  const ctx = new OfflineAudioContext(EDITOR_AUDIO.channels, length, rate)
  buildGraph(ctx, p, buffers, a, 0, { until: b })
  const out = await ctx.startRendering()
  const channels = Array.from({ length: out.numberOfChannels }, (_, c) => out.getChannelData(c))
  return { channels, rate: out.sampleRate, bitDepth: opts.bitDepth ?? EDITOR_AUDIO.defaultBitDepth, gain: opts.normalize ? normalizeChannels(channels) : 1 }
}

/** Convenience: render + encode in one call. */
export async function renderToWav(p: Project, buffers: Buffers, opts: RenderOpts = {}): Promise<ArrayBuffer> {
  const r = await renderProject(p, buffers, opts)
  return encodeWav(r.channels, r.rate, r.bitDepth)
}

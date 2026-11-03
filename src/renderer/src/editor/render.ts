import { DEFAULT_FX, REVERB } from '../config/fx'
import { EDITOR_AUDIO } from '../config/editorAudio'
import { projectEnd, type Project } from './model'
import { buildGraph, type Buffers } from './schedule'

/** Faster-than-real-time mixdown through the SAME buildGraph the live transport uses.
 *  Length = projectEnd / speed + reverb tail. Rate = the highest source rate (no resampling for the usual single-rate case). */
export async function renderProject(p: Project, buffers: Buffers): Promise<{ channels: Float32Array[]; rate: number }> {
  const fx = p.master ?? DEFAULT_FX
  const used = p.clips.map((c) => buffers.get(c.src)).filter((b): b is AudioBuffer => !!b)
  const rate = used.reduce((m, b) => Math.max(m, b.sampleRate), 0) || EDITOR_AUDIO.defaultRate
  const tail = fx.wet > 0 ? fx.decay + REVERB.preDelay : 0
  const length = Math.max(1, Math.ceil((projectEnd(p) / Math.max(fx.speed, EDITOR_AUDIO.minSpeed) + tail) * rate - 1e-6))
  const ctx = new OfflineAudioContext(EDITOR_AUDIO.channels, length, rate)
  buildGraph(ctx, p, buffers, 0, 0)
  const out = await ctx.startRendering()
  return { channels: Array.from({ length: out.numberOfChannels }, (_, c) => out.getChannelData(c)), rate: out.sampleRate }
}

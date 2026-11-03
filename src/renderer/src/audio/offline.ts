import type { Fx } from '../../../shared/types'
import { REVERB } from '../config/fx'
import { buildChain } from './chain'

/** Faster-than-real-time render of a track through the SAME chain used live. Pitch follows speed
 *  (a buffer source can't time-stretch), so pitch-lock versions are not exportable. */
export async function renderVersion(path: string, fx: Fx): Promise<{ channels: Float32Array[]; rate: number }> {
  const bytes = await (await fetch('media://local' + encodeURI(path))).arrayBuffer()
  const src = await new AudioContext().decodeAudioData(bytes)
  const tail = fx.wet > 0 ? fx.decay + REVERB.preDelay : 0
  const length = Math.ceil((src.duration / fx.speed + tail) * src.sampleRate)
  const ctx = new OfflineAudioContext(2, length, src.sampleRate)
  const node = ctx.createBufferSource(); node.buffer = src; node.playbackRate.value = fx.speed
  buildChain(ctx, node).apply(fx)
  node.start()
  const out = await ctx.startRendering()
  return { channels: [out.getChannelData(0), out.getChannelData(1)], rate: out.sampleRate }
}

import type { Fx } from '../../../shared/types'
import { REVERB } from '../config/fx'
import { dampToHz, makeImpulse } from './reverb'

/**  source -> dry --------------------------\
 *          -> convolver -> damp(lowpass) -> wet --+-> destination
 *  Used live (engine.ts) and offline for export, so both sound identical. */
export function buildChain(ctx: BaseAudioContext, source: AudioNode) {
  const out = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), conv = ctx.createConvolver(), damp = ctx.createBiquadFilter()
  damp.type = 'lowpass'
  out.connect(ctx.destination)
  source.connect(dry).connect(out)
  source.connect(conv).connect(damp).connect(wet).connect(out)
  let lastDecay = -1
  return {
    out, // final node: tap here for meters/visualisers
    apply(fx: Fx) {
      wet.gain.value = fx.wet
      dry.gain.value = 1 - fx.wet * REVERB.dryDuck
      damp.frequency.value = dampToHz(fx.damping)
      if (Math.abs(fx.decay - lastDecay) > 0.05) {
        const [l, r] = makeImpulse(ctx.sampleRate, fx.decay)
        const buf = ctx.createBuffer(2, l.length, ctx.sampleRate)
        buf.copyToChannel(l as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(r as Float32Array<ArrayBuffer>, 1)
        conv.buffer = buf; lastDecay = fx.decay
      }
    }
  }
}

import type { Fx } from '../../../shared/types'
import { REVERB } from '../config/fx'
import { dampToHz, makeImpulse } from './reverb'

/**  source -> dry --------------------------\
 *          -> convolver -> damp(lowpass) -> wet --+-> destination
 *  Used live (engine.ts) and offline for export, so both sound identical. */
export function buildChain(ctx: BaseAudioContext, source: AudioNode) {
  const out = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), damp = ctx.createBiquadFilter()
  let conv: ConvolverNode | null = null, retired: ConvolverNode | null = null, retireTimer = 0
  damp.type = 'lowpass'
  out.connect(ctx.destination)
  source.connect(dry).connect(out)
  damp.connect(wet).connect(out)
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
        // A new impulse gets a new convolver; the old one stays connected (no new input) so its tail rings out instead of being cut
        // (song change, gap between songs). Only one old tail is ever kept, so dragging the slider cannot pile up convolvers.
        if (retired) { retired.disconnect(); clearTimeout(retireTimer); retired = null }
        if (conv) { source.disconnect(conv); retired = conv; const r = conv; retireTimer = setTimeout(() => { r.disconnect(); if (retired === r) retired = null }, (Math.max(lastDecay, 0) + 1.5) * 1000) as unknown as number }
        conv = ctx.createConvolver(); conv.buffer = buf; source.connect(conv); conv.connect(damp); lastDecay = fx.decay
      }
    }
  }
}

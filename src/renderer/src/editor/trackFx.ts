import { REVERB } from '../config/fx'
import { dampToHz, makeImpulse } from '../audio/reverb'
import type { TrackFx } from './model'

/** True when the track's effects would change the sound (so we only build nodes when needed). */
export const trackFxActive = (fx?: TrackFx) => !!fx && (!!fx.low || !!fx.mid || !!fx.high || (!!fx.reverb && fx.reverb.wet > 0))
export const trackReverbTail = (fx?: TrackFx) => (fx?.reverb && fx.reverb.wet > 0 ? fx.reverb.decay + REVERB.preDelay : 0)

/** Wires a track's EQ and reverb after `src` and returns the node to connect onward. Used live and offline (same graph). */
export function trackFxChain(ctx: BaseAudioContext, fx: TrackFx | undefined, src: AudioNode, eq: { lowHz: number; midHz: number; midQ: number; highHz: number }): AudioNode {
  let node: AudioNode = src
  if (fx && (fx.low || fx.mid || fx.high)) {
    const lo = ctx.createBiquadFilter(), mid = ctx.createBiquadFilter(), hi = ctx.createBiquadFilter()
    lo.type = 'lowshelf'; lo.frequency.value = eq.lowHz; lo.gain.value = fx.low
    mid.type = 'peaking'; mid.frequency.value = eq.midHz; mid.Q.value = eq.midQ; mid.gain.value = fx.mid
    hi.type = 'highshelf'; hi.frequency.value = eq.highHz; hi.gain.value = fx.high
    node.connect(lo); lo.connect(mid); mid.connect(hi); node = hi
  }
  const rv = fx?.reverb
  if (rv && rv.wet > 0) {
    const sum = ctx.createGain(), dry = ctx.createGain(), wet = ctx.createGain(), conv = ctx.createConvolver(), damp = ctx.createBiquadFilter()
    dry.gain.value = 1 - rv.wet * REVERB.dryDuck; wet.gain.value = rv.wet
    damp.type = 'lowpass'; damp.frequency.value = dampToHz(rv.damping)
    const [l, r] = makeImpulse(ctx.sampleRate, rv.decay), buf = ctx.createBuffer(2, l.length, ctx.sampleRate)
    buf.copyToChannel(l as Float32Array<ArrayBuffer>, 0); buf.copyToChannel(r as Float32Array<ArrayBuffer>, 1); conv.buffer = buf
    node.connect(dry).connect(sum); node.connect(conv).connect(damp).connect(wet).connect(sum); node = sum
  }
  return node
}

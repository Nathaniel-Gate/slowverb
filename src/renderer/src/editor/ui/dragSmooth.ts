import type { Drag } from './timelineDrags'

const mix = (a: number, b: number, k: number) => a + (b - a) * k

/** One animation-frame step of `shown` toward `target` for drags whose value is a continuous number (fades, gain,
 *  envelope points). Other drags (moves, trims) return the target unchanged. `done` = close enough to stop animating. */
export function easeDrag(shown: Drag | null, target: Drag, k: number, eps: number): { d: Drag; done: boolean } {
  if (!shown || shown.kind !== target.kind) return { d: target, done: true }
  switch (target.kind) {
    case 'fade': {
      const s = shown as typeof target, dur = mix(s.dur, target.dur, k)
      return { d: { ...target, dur }, done: Math.abs(dur - target.dur) < eps }
    }
    case 'gain': {
      const s = shown as typeof target, gain = mix(s.gain, target.gain, k)
      return { d: { ...target, gain }, done: Math.abs(gain - target.gain) < eps / 20 }
    }
    case 'env': {
      const s = shown as typeof target, t = mix(s.t, target.t, k), g = mix(s.g, target.g, k)
      return { d: { ...target, t, g }, done: Math.abs(t - target.t) < eps && Math.abs(g - target.g) < eps / 20 }
    }
    case 'envseg': {
      const s = shown as typeof target, dy = mix(s.dy, target.dy, k)
      return { d: { ...target, dy }, done: Math.abs(dy - target.dy) < 0.4 }
    }
    default: return { d: target, done: true }
  }
}

import { REVERB } from '../config/fx'
/** Synthetic room: stereo noise with a cubic fade-out after a short pre-delay. Pure function, easy to test. */
export function makeImpulse(rate: number, seconds: number, rand: () => number = Math.random): [Float32Array, Float32Array] {
  const pre = Math.floor(rate * REVERB.preDelay), len = pre + Math.max(1, Math.floor(rate * seconds))
  const ch = (): Float32Array => {
    const d = new Float32Array(len)
    for (let i = pre; i < len; i++) d[i] = (rand() * 2 - 1) * (1 - (i - pre) / (len - pre)) ** 3
    return d
  }
  return [ch(), ch()]
}
/** damping 0..1 -> low-pass cutoff on the reverb tail (higher damping = darker). */
export const dampToHz = (d: number) => REVERB.dampMaxHz * (REVERB.dampMinHz / REVERB.dampMaxHz) ** d

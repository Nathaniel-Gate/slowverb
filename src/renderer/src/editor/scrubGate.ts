/** Decides whether a scrub move should fire a new audio grain. A grain must never replay the same spot (that is the "plays twice"
 *  you hear when the pointer-down and the first move land on nearly the same time), and moves faster than `minInterval` are dropped. */
export type ScrubCfg = { minMove: number; repeatGuard: number; minInterval: number }
export function shouldGrain(lastT: number, lastAt: number, t: number, now: number, c: ScrubCfg): boolean {
  if (now - lastAt < c.minInterval) return false
  if (lastT >= 0 && Math.abs(t - lastT) < c.minMove && now - lastAt < c.repeatGuard) return false
  return true
}

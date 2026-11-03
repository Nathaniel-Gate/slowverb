import type { Fx } from '../../../shared/types'
// Slider limits and defaults. Change a number here, the whole app follows.
export const SPEED = { min: 0.5, max: 2, step: 0.01 }
export const REVERB = { decayMin: 0.5, decayMax: 12, preDelay: 0.02, dampMinHz: 1500, dampMaxHz: 18000, dryDuck: 0.5 }
export const DEFAULT_FX: Fx = { speed: 1, pitchLock: false, wet: 0, decay: 3, damping: 0.3 }

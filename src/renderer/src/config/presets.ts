import type { Fx } from '../../../shared/types'
import { DEFAULT_FX } from './fx'
const p = (o: Partial<Fx>): Fx => ({ ...DEFAULT_FX, ...o })
// Add your own: { name, fx }. Unlisted values fall back to DEFAULT_FX.
export const PRESETS: { name: string; fx: Fx }[] = [
  { name: 'Original', fx: p({}) },
  { name: 'Slowed', fx: p({ speed: 0.85 }) },
  { name: 'Slowed + Reverb', fx: p({ speed: 0.8, wet: 0.4, decay: 4.5, damping: 0.4 }) },
  { name: 'Deep Slow', fx: p({ speed: 0.7, wet: 0.5, decay: 6, damping: 0.55 }) },
  { name: 'Sped Up', fx: p({ speed: 1.25 }) },
  { name: 'Sped Up + Reverb', fx: p({ speed: 1.2, wet: 0.3, decay: 3 }) }
]

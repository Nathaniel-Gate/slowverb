import type { Fx } from '@shared/types'
import { allPresets } from '@app/features/fx/fx.store'
import { CONFIG } from '../config'

/** Next/previous song id with wrap-around. No current song: first (dir 1) or last (dir -1). Empty list: null. */
export function neighbour(ids: string[], cur: string | null, dir: 1 | -1 = 1): string | null {
  const n = ids.length; if (!n) return null
  const i = cur === null ? -1 : ids.indexOf(cur)
  if (i < 0) return dir > 0 ? ids[0] : ids[n - 1]
  return ids[(i + dir + n) % n]
}

/** What to do when a song ends: the next id to play, or null to stop. A one-song library never loops by itself. */
export function afterEnd(ids: string[], cur: string | null, autoAdvance: boolean): string | null {
  return autoAdvance && ids.length > 1 ? neighbour(ids, cur, 1) : null
}

/** Where to resume a song: the saved position, unless it is too close to either end. */
export function resumeAt(saved: number, duration: number): number {
  if (saved < CONFIG.resumeMinSec) return 0
  if (duration > 0 && saved > duration - CONFIG.resumeEndGuardSec) return 0
  return saved
}

/** Name of the preset that equals this fx exactly (so the chip lights up after restoring a remembered version). */
export function matchPreset(fx: Fx, user: { name: string; fx: Fx }[]): string | null {
  const same = (a: Fx, b: Fx) => a.speed === b.speed && a.pitchLock === b.pitchLock && a.wet === b.wet && a.decay === b.decay && a.damping === b.damping
  return allPresets(user).find((p) => same(p.fx, fx))?.name ?? null
}

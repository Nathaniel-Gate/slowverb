import type { Fx } from '@shared/types'
import { DEFAULT_FX } from '@app/config/fx'
import { UI } from './config'

export const fmtTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60), r = Math.floor(s % 60)
  return `${m}:${String(r).padStart(2, '0')}`
}

/** Row tag like "0.80x · reverb" for a song with a remembered version; null when it is the original. */
export function fxTag(fx?: Fx): string | null {
  if (!fx) return null
  const parts: string[] = []
  if (Math.abs(fx.speed - DEFAULT_FX.speed) > 0.005) parts.push(`${fx.speed.toFixed(2)}x`)
  if (fx.wet >= UI.tag.minWet) parts.push('reverb')
  return parts.length ? parts.join(' · ') : null
}

export const fmtSize = (bytes: number) => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

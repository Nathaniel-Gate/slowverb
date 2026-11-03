import type { Project } from './model'

/** True when the edit is just the untouched song (one full clip at 0, no fades/gain/envelope/speed, no explicit mix).
 *  The player then plays the file directly; any real edit makes the player play the edit instead. */
export function isPristine(p: Project): boolean {
  if (p.master) return false
  const c = p.clips.filter((x) => !x.disabled)
  if (c.length !== 1 || p.clips.length !== 1) return false
  const k = c[0], d = p.sources[k.src]?.duration ?? 0, tr = p.tracks.find((t) => t.id === k.track)
  return k.src === p.song && k.start === 0 && k.srcIn === 0 && Math.abs(k.srcOut - d) < 0.01 && (k.speed ?? 1) === 1 && k.gain === 1
    && k.fadeIn === 0 && k.fadeOut === 0 && !k.env?.length && !tr?.mute && (tr?.gain ?? 1) === 1
}

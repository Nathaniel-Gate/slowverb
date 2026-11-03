import { MIN_CLIP, clipDur, clipEnd, clipSpeed, srcSpan, type Clip, type Project } from './model'
import { SLACK, SPEED_MAX, SPEED_MIN, clamp, clearRange, finite, fitFades, lockedIds, minDur, reEnv, settle, xfadePartners } from './clipmath'
import { rippleResize } from './opsTrim'
import type { RippleOpts } from './opsRange'

// Clip speed (rate stretch) and rolling edits. All pure. Fades stay in timeline seconds.

const editable = (p: Project, id: string) => {
  const c = p.clips.find(x => x.id === id)
  return c && p.sources[c.src] && !lockedIds(p).has(c.track) ? c : null
}

/**
 * Speed clamped to SPEED_MIN..SPEED_MAX (and so the clip stays >= MIN_CLIP long). Source span is kept, so timeline
 * length = span / speed. ripple: later material shifts (sync-lock aware); otherwise a longer clip overwrites neighbours.
 */
export function setClipSpeed(p: Project, id: string, speed: number, ripple = false, opts?: RippleOpts): Project {
  const c = editable(p, id)
  if (!c || !finite(speed) || speed <= 0) return p
  const s = clamp(speed, SPEED_MIN, Math.min(SPEED_MAX, srcSpan(c) / MIN_CLIP))
  if (s === clipSpeed(c)) return p
  const next = fitFades(reEnv(c, { ...c, speed: s }))
  if (ripple) return rippleResize(p, c, next, Math.min(clipEnd(c), clipEnd(next)), opts)
  const swapped = p.clips.map(x => (x.id === id ? next : x))
  return { ...p, clips: settle(clearRange(swapped, c.track, next.start, clipEnd(next), xfadePartners(swapped, next))) }
}

/** Rate stretch (R tool): pick the speed that makes the clip end at newEnd (start kept, clamped speed, overwrite). */
export function rateStretch(p: Project, id: string, newEnd: number): Project {
  const c = editable(p, id)
  if (!c || !finite(newEnd) || newEnd - c.start <= 0) return p
  return setClipSpeed(p, id, srcSpan(c) / (newEnd - c.start), false)
}

/**
 * Rolling edit (N): move the cut between two adjacent clips (or the centre of their crossfade) to t. The left clip's
 * out and the right clip's in move together, so total length is unchanged. t is clamped to the source handles,
 * minimum clip lengths and timeline 0. Same p if not adjacent on one unlocked track.
 */
export function rollEdit(p: Project, leftId: string, rightId: string, t: number): Project {
  const l = editable(p, leftId), r = editable(p, rightId)
  if (!l || !r || l === r || l.track !== r.track || !finite(t)) return p
  const ov = clipEnd(l) - r.start
  if (ov < -SLACK || r.start < l.start || (ov > SLACK && ov > Math.min(l.fadeOut, r.fadeIn) + SLACK)) return p
  const sl = clipSpeed(l), sr = clipSpeed(r), cut = ov > SLACK ? (r.start + clipEnd(l)) / 2 : r.start
  const xf = ov > SLACK
  const lo = Math.max(-(clipDur(l) - minDur(l) - l.fadeIn - (xf ? l.fadeOut : 0)), -r.srcIn / sr, -r.start)
  const hi = Math.min((p.sources[l.src].duration - l.srcOut) / sl, clipDur(r) - minDur(r) - r.fadeOut - (xf ? r.fadeIn : 0))
  const dt = clamp(t - cut, Math.min(0, lo), Math.max(0, hi))
  if (Math.abs(dt) <= SLACK / 10) return p
  const nl: Clip = fitFades(reEnv(l, { ...l, srcOut: Math.min(p.sources[l.src].duration, l.srcOut + dt * sl) }))
  const nr: Clip = fitFades(reEnv(r, { ...r, start: r.start + dt, srcIn: Math.max(0, r.srcIn + dt * sr) }))
  if (clipDur(nl) < minDur(l) - SLACK || clipDur(nr) < minDur(r) - SLACK) return p
  return { ...p, clips: settle(p.clips.map(c => (c.id === l.id ? nl : c.id === r.id ? nr : c))) }
}

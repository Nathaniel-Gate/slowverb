import { clipDur, type Project } from './model'

/** Human label for the step that turned project a into b (used by undo toasts and the history popover). Pure. */
export function describeStep(a: Project, b: Project): string {
  const sum = (p: Project) => p.clips.reduce((n, c) => n + clipDur(c), 0)
  const na = a.clips.length, nb = b.clips.length
  if (nb > na) return Math.abs(sum(a) - sum(b)) < 1e-6 ? 'Cut' : 'Add clips'
  if (nb < na) return Math.abs(sum(a) - sum(b)) < 1e-6 ? 'Join' : 'Delete'
  const ca = new Map(a.clips.map((c) => [c.id, c]))
  const diff = (f: (x: Project['clips'][number], y: Project['clips'][number]) => boolean) => b.clips.some((c) => { const o = ca.get(c.id); return !!o && f(o, c) })
  if (diff((o, c) => (o.speed ?? 1) !== (c.speed ?? 1))) return 'Speed'
  if (diff((o, c) => o.srcIn !== c.srcIn || o.srcOut !== c.srcOut)) return 'Trim'
  if (diff((o, c) => o.start !== c.start || o.track !== c.track)) return 'Move'
  if (diff((o, c) => o.gain !== c.gain)) return 'Gain'
  if (diff((o, c) => o.fadeIn !== c.fadeIn || o.fadeOut !== c.fadeOut)) return 'Fade'
  if (diff((o, c) => o.name !== c.name || o.label !== c.label || o.disabled !== c.disabled)) return 'Clip properties'
  if (JSON.stringify(a.markers) !== JSON.stringify(b.markers)) return 'Markers'
  if (JSON.stringify(a.master) !== JSON.stringify(b.master)) return 'Mix'
  if (a.bpm !== b.bpm || a.bpmOffset !== b.bpmOffset) return 'BPM'
  if (JSON.stringify(a.tracks) !== JSON.stringify(b.tracks)) return 'Tracks'
  return 'Edit'
}

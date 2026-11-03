import type { Project } from './model'
import { HISTORY_CAP } from './clipmath'

export type History = { past: Project[]; present: Project; future: Project[] }
export { HISTORY_CAP }

export const createHistory = (p: Project): History => ({ past: [], present: p, future: [] })

/** Commit a new present. Identical projects (same object or same JSON) are ignored; a real change clears redo. */
export function pushHistory(h: History, p: Project): History {
  if (p === h.present || JSON.stringify(p) === JSON.stringify(h.present)) return h
  return { past: [...h.past, h.present].slice(-HISTORY_CAP), present: p, future: [] }
}

export function undo(h: History): History {
  if (!h.past.length) return h
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] }
}

export function redo(h: History): History {
  if (!h.future.length) return h
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) }
}

export const canUndo = (h: History) => h.past.length > 0
export const canRedo = (h: History) => h.future.length > 0

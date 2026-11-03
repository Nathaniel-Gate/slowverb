import { useEffect } from 'react'
import { SHORTCUTS } from '../config/shortcuts'
import { EDITOR, EDITOR_KEYS, type EditorAction } from '../config/editorKeys'
import { useEditor } from './editor.store'
import { editPoints } from './ops'
import { projectEnd, type Tool } from './model'

const typing = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['range', 'checkbox', 'button'].includes(t.type)) || (t instanceof HTMLElement && t.isContentEditable)

function run(a: EditorAction) {
  const s = useEditor.getState(), t = s.now()
  const seek = (x: number) => s.setPlayhead(Math.max(0, x))
  const zoom = (f: number) => s.setZoom(s.pxPerSec * f, t)
  const step = (dir: 1 | -1) => {
    if (!s.project) return
    const pts = editPoints(s.project), hit = dir > 0 ? pts.find((p) => p > t + EDITOR.edgeEps) : [...pts].reverse().find((p) => p < t - EDITOR.edgeEps)
    if (hit !== undefined) seek(hit); else seek(dir > 0 ? projectEnd(s.project) : 0)
  }
  if (a.startsWith('tool:')) return s.setTool(a.slice(5) as Tool)
  const table: Record<string, () => void> = {
    play: () => void s.togglePlay(), split: s.splitAtPlayhead, delete: () => s.deleteSelection(false), rippleDelete: () => s.deleteSelection(true),
    undo: s.undo, redo: s.redo, snap: s.toggleSnap, fit: () => s.fitToView(s.viewWidth || 1000), zoomIn: () => zoom(EDITOR.zoomStep), zoomOut: () => zoom(1 / EDITOR.zoomStep),
    nudgeBack: () => seek(t - EDITOR.nudgeSec), nudgeFwd: () => seek(t + EDITOR.nudgeSec), nudgeBackBig: () => seek(t - EDITOR.nudgeBigSec), nudgeFwdBig: () => seek(t + EDITOR.nudgeBigSec),
    prevEdit: () => step(-1), nextEdit: () => step(1), home: () => seek(0), end: () => s.project && seek(projectEnd(s.project)),
    markIn: () => s.setMark('in', t), markOut: () => s.setMark('out', t), clearIn: () => s.setMark('in', null), clearOut: () => s.setMark('out', null),
    marker: s.addMarkerAtPlayhead, selectAll: s.selectAll, deselect: () => s.select([]), copy: s.copy, cut: s.cut, paste: s.paste
  }
  table[a]?.()
}

/** Editor shortcuts. Capture phase so that, in editor mode, the player's own shortcuts (Space, arrows, B) never fire underneath. */
export function useEditorKeys() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!useEditor.getState().open || typing(e.target) || e.ctrlKey) return
      const hit = EDITOR_KEYS.find((k) => k.code === e.code && !!k.meta === e.metaKey && (k.shift === undefined || k.shift === e.shiftKey) && !!k.alt === e.altKey)
      if (!hit && !SHORTCUTS.some((s) => s.code === e.code)) return   // not ours and not the player's: leave it (modifier keys etc.)
      e.stopPropagation(); e.preventDefault()                        // swallow so the player shortcut underneath never fires
      if (hit && (!e.repeat || hit.repeat)) run(hit.action)
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
}

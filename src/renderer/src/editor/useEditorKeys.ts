import { useEffect } from 'react'
import { SHORTCUTS } from '../config/shortcuts'
import { commandForEvent, runCommandById } from './commands'
import { useEditor } from './editor.store'
import { anyOverlay, useOverlay } from './overlayStore'

const typing = (t: EventTarget | null) =>
  t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && !['range', 'checkbox', 'button'].includes(t.type)) || (t instanceof HTMLElement && t.isContentEditable)
const bareK = (e: KeyboardEvent) => e.code === 'KeyK' && !e.metaKey && !e.altKey && !e.shiftKey

/** Editor shortcuts, driven by the command registry (commands.ts) so user rebinds apply instantly. Capture phase so that, in
 *  editor mode, the player's own shortcuts (Space, arrows, B) never fire underneath. Overlays (palette, shortcuts dialog,
 *  context menu) handle their own keys, so we stand down while one is open. */
export function useEditorKeys() {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const ed = useEditor.getState()
      if (!ed.open || typing(e.target) || e.ctrlKey || useOverlay.getState().capturing) return
      const hit = commandForEvent(e)
      if (anyOverlay()) { if (!hit || !hit.id.match(/^(palette|shortcuts)$/)) return }   // palette/shortcuts keys still toggle their own overlay
      if (!hit && !SHORTCUTS.some((s) => s.code === e.code)) return   // not ours and not the player's: leave it (modifier keys etc.)
      e.stopPropagation(); e.preventDefault()                        // swallow so the player shortcut underneath never fires
      if (!hit || (e.repeat && !hit.repeat)) return
      if (bareK(e)) ed.shuttleHold(true)                              // K held + J/L = slow motion
      runCommandById(hit.id, ed)
    }
    const up = (e: KeyboardEvent) => { if (e.code === 'KeyK') useEditor.getState().shuttleHold(false) }
    const blur = () => useEditor.getState().shuttleHold(false)
    window.addEventListener('keydown', key, true); window.addEventListener('keyup', up, true); window.addEventListener('blur', blur)
    return () => { window.removeEventListener('keydown', key, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur) }
  }, [])
}

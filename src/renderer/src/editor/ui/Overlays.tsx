import { useEffect } from 'react'
import { useOverlay } from '../overlayStore'
import { CommandPalette } from './CommandPalette'
import { ContextMenuHost } from './ContextMenu'
import { ShortcutsDialog } from './ShortcutsDialog'
import { Toast } from './Toast'

/** Everything that floats above the editor. Mounted once, by HeaderBar (which always renders). */
export function Overlays() {
  useEffect(() => () => useOverlay.getState().set({ palette: false, shortcuts: false, history: false, menu: false, capturing: false }), [])
  return <><Toast /><ContextMenuHost /><CommandPalette /><ShortcutsDialog /></>
}

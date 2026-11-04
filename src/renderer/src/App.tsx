import { useEffect, useState } from 'react'
import { EDITOR } from './config/editorKeys'
import { useEditor } from './editor/editor.store'
import { EditorView } from './editor/ui/EditorView'
import { ModeSwitch } from './editor/ui/HeaderBar'
import { FxPanel } from './features/fx/FxPanel'
import { Playlist } from './features/library/Playlist'
import { AddPopup } from './features/lists/AddPopup'
import { useDrop } from './features/library/useDrop'
import { NowPlaying } from './features/player/NowPlaying'
import { Transport } from './features/player/Transport'
import { useShortcuts } from './features/player/useShortcuts'

/** Keep the editor mounted briefly after it closes so its exit animation can play. */
function useOverlay(open: boolean) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) { setMounted(true); return }
    const id = window.setTimeout(() => setMounted(false), EDITOR.unmountMs); return () => clearTimeout(id)
  }, [open])
  return open || mounted
}

/** Player cards are always a whole number of grid squares tall, so their top and bottom edges sit on the blueprint lines whatever is inside them. */
function useSnapPanels() {
  useEffect(() => {
    const unit = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--u')) || 24
    const snap = (el: HTMLElement) => { el.style.minHeight = '0'; el.style.minHeight = `${Math.ceil(el.offsetHeight / unit()) * unit()}px` }
    const ro = new ResizeObserver((es) => es.forEach((e) => snap(e.target.parentElement as HTMLElement))), seen = new Set<Element>()
    const watch = () => document.querySelectorAll<HTMLElement>('.main .stack > .panel').forEach((p) => {
      if (!seen.has(p)) { seen.add(p); snap(p) }
      Array.from(p.children).forEach((c) => ro.observe(c))
    })
    watch(); const mo = new MutationObserver(watch); mo.observe(document.querySelector('.main')!, { childList: true, subtree: true })
    return () => { ro.disconnect(); mo.disconnect() }
  }, [])
}

export function App() {
  useSnapPanels()
  const { over, handlers } = useDrop()
  useShortcuts()
  const open = useEditor((s) => s.open), editorMounted = useOverlay(open)
  return (
    <div className="app" {...handlers}>
      <div className="drag"><ModeSwitch /></div>
      {over && <div className="drop"><span className="mono">Drop audio to add it</span></div>}
      <main className="main">
        <NowPlaying />
        <div className="stack"><Transport /><FxPanel /></div>
      </main>
      <Playlist />
      {editorMounted && <EditorView leaving={!open} />}
      <AddPopup />
    </div>
  )
}

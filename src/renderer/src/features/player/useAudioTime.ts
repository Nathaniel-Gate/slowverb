import { useEffect, useState } from 'react'
import { engine } from '../../audio/engine'
import { useEditor } from '../../editor/editor.store'
import { projectEnd } from '../../editor/model'
import { useLibrary } from '../library/library.store'
import { usePlayer } from './player.store'

// Streamed media reports Infinity duration, so fall back to the tag duration scanned at drop time.
const duration = (el: HTMLAudioElement) =>
  isFinite(el.duration) ? el.duration : useLibrary.getState().tracks.find((t) => t.id === usePlayer.getState().cur)?.duration ?? 0
/** Re-renders only the component that uses it with the current position + duration. Plays from the file, or from the editor's
 *  transport when the player is playing the current edit (then the length is the edit's length). */
export function useAudioTime() {
  const [pos, setPos] = useState({ t: 0, d: 0 })
  const viaEdit = usePlayer((s) => s.viaEdit)
  useEffect(() => {
    if (viaEdit) {
      const tick = () => { const e = useEditor.getState(); setPos({ t: e.now(), d: e.project ? projectEnd(e.project) : 0 }) }
      tick(); const id = window.setInterval(tick, 200)
      return () => window.clearInterval(id)
    }
    const el = engine.el, tick = () => setPos({ t: el.currentTime, d: duration(el) })
    tick()
    for (const e of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) el.addEventListener(e, tick)
    return () => { for (const e of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) el.removeEventListener(e, tick) }
  }, [viaEdit])
  return pos
}

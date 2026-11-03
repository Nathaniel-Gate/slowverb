import { useEffect, useState } from 'react'
import { engine } from '../../audio/engine'
import { useLibrary } from '../library/library.store'
import { usePlayer } from './player.store'

// Streamed media reports Infinity duration, so fall back to the tag duration scanned at drop time.
const duration = (el: HTMLAudioElement) =>
  isFinite(el.duration) ? el.duration : useLibrary.getState().tracks.find((t) => t.id === usePlayer.getState().cur)?.duration ?? 0
/** Re-renders only the component that uses it, ~4x/sec, with current position + duration. */
export function useAudioTime() {
  const [pos, setPos] = useState({ t: 0, d: 0 })
  useEffect(() => {
    const el = engine.el, tick = () => setPos({ t: el.currentTime, d: duration(el) })
    tick()
    for (const e of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) el.addEventListener(e, tick)
    return () => { for (const e of ['timeupdate', 'loadedmetadata', 'durationchange', 'emptied']) el.removeEventListener(e, tick) }
  }, [])
  return pos
}

import { useState } from 'react'
import { AUDIO_EXTS } from '../../../../shared/types'
import { usePlayer } from '../player/player.store'
import { useLibrary } from './library.store'

/** Window-level drop zone. Folders are allowed (no extension); main filters to audio. */
export function useDrop() {
  const [over, setOver] = useState(false)
  const handlers = {
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setOver(true) },
    onDragLeave: (e: React.DragEvent) => { if (e.relatedTarget === null) setOver(false) },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault(); setOver(false)
      const files = [...e.dataTransfer.files].filter((f) => { const x = f.name.split('.'); return x.length < 2 || AUDIO_EXTS.includes(x.pop()!.toLowerCase()) })
      if (!files.length) return
      const added = await useLibrary.getState().add(files)
      if (added.length && !usePlayer.getState().playing) usePlayer.getState().play(added[0].id)
    }
  }
  return { over, handlers }
}

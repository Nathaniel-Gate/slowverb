import { useState, type DragEvent as RDragEvent } from 'react'
import { mediaKindOf } from '../../../../shared/visualsModel'
import { clipDur } from '../../editor/model'
import { useEditor } from '../../editor/editor.store'
import { useClips } from '../clips.store'
import { insertMedia } from '../insertMedia'

const hasFiles = (e: RDragEvent) => Array.from(e.dataTransfer.types).includes('Files')

/** Clips tab: pictures/videos dragged in from Finder are COPIED into Visuals/ (never moved or changed) and laid one after another
 *  from the playhead on the top visual track. Audio files are left to the player's own drop (it is not on screen here). */
export function useClipsDrop(on: boolean) {
  const [over, setOver] = useState(false)
  if (!on) return { over: false, handlers: {} }
  return {
    over,
    handlers: {
      onDragOver: (e: RDragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; setOver(true) },
      onDragLeave: (e: RDragEvent) => { if (e.relatedTarget === null) setOver(false) },
      onDrop: async (e: RDragEvent) => {
        if (!hasFiles(e)) return
        e.preventDefault(); e.stopPropagation(); setOver(false)
        const paths = [...e.dataTransfer.files].map((f) => window.api.pathFor(f)).filter(Boolean)
        const media = paths.filter((p) => mediaKindOf(p) || !p.split('/').pop()!.includes('.'))   // folders have no extension
        if (!media.length) return useEditor.getState().showToast('Only pictures and videos can go on the Clips timeline')
        const added = await useClips.getState().importFiles(media)
        let t = useEditor.getState().now()
        for (const p of added) {
          const before = new Set(useEditor.getState().project?.clips.map((c) => c.id))
          if (!(await insertMedia(p, t))) break
          const c = useEditor.getState().project?.clips.find((x) => !before.has(x.id)); if (c) t = c.start + clipDur(c)
        }
        useEditor.getState().showToast(`Added ${added.length} file${added.length === 1 ? '' : 's'} to Visuals`)
      }
    }
  }
}

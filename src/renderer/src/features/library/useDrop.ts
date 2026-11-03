import { useState } from 'react'
import { AUDIO_EXTS } from '../../../../shared/types'
import { afterAdd } from '../settings/afterAdd'
import { useLists } from '../lists/lists.store'
import { placeFiles } from '../lists/place'
import { usePlaylists } from '../playlists/playlists.store'

/** Window-level drop zone for files/folders from Finder. A popup asks where they go (Songs or Sound bites, plus playlists), then they are
 *  copied or moved there (IMPORT_MODE in shared/config.ts), so the library on disk always matches the app. */
export function useDrop() {
  const [over, setOver] = useState(false)
  const external = (e: React.DragEvent) => !e.dataTransfer.types.includes('application/x-slowverb-track')
  const handlers = {
    onDragOver: (e: React.DragEvent) => { if (!external(e)) return; e.preventDefault(); setOver(true) },
    onDragLeave: (e: React.DragEvent) => { if (e.relatedTarget === null) setOver(false) },
    onDrop: async (e: React.DragEvent) => {
      e.preventDefault(); setOver(false); if (!external(e)) return
      const paths = [...e.dataTransfer.files].filter((f) => { const x = f.name.split('.'); return x.length < 2 || AUDIO_EXTS.includes(x.pop()!.toLowerCase()) })
        .map((f) => window.api.pathFor(f)).filter(Boolean)
      if (!paths.length) return
      const L = useLists.getState(), sel = usePlaylists.getState().sel
      const added = await placeFiles(paths, `${paths.length} file${paths.length === 1 ? '' : 's'}`, L.mode === 'lists' && L.listSel ? [L.listSel] : [], sel?.split('/')[0])
      if (added.length) afterAdd(added[0].id)
    }
  }
  return { over, handlers }
}

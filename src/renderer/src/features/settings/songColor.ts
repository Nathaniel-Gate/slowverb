import { NEONS, neonIndex } from '../../../../shared/neon'
import { TRACK_COLORS } from '../../config/timeline'
import { useEditor } from '../../editor/editor.store'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'

/** Every song gets its own neon, picked from its file path (the same song always gets the same one). The list lives in shared/neon.ts
 *  (the phone app uses it too). It drives --neon (playhead, sliders, selected chips, current song bar, play button...) and the editor's track colours. */
export { NEONS }

export function applySongColor(key: string | null | undefined) {
  const i = neonIndex(key)
  const r = document.documentElement.style
  r.setProperty('--neon', NEONS[i]); r.setProperty('--accent', NEONS[i])
  const order = [0, 4, 7, 2, 1, 5, 9]   // track colours: the song's neon first, then well-spread others from the same list
  order.forEach((d, k) => { TRACK_COLORS[k] = NEONS[(i + d) % NEONS.length] })
}

export function bindSongColor() {
  const key = () => {
    const e = useEditor.getState()
    if (e.open && e.project) return e.project.song
    const cur = usePlayer.getState().cur, t = useLibrary.getState().tracks.find((x) => x.id === cur)
    return t?.path ?? null
  }
  const go = () => applySongColor(key())
  usePlayer.subscribe((s, p) => { if (s.cur !== p.cur) go() })
  useEditor.subscribe((s, p) => { if (s.open !== p.open || s.project?.song !== p.project?.song) go() })
  useLibrary.subscribe((s, p) => { if (s.tracks !== p.tracks) go() })
  go()
}

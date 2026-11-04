import { TRACK_COLORS } from '../../config/timeline'
import { useEditor } from '../../editor/editor.store'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'

/** Every song gets its own neon, picked from its file path (the same song always gets the same one). Only colours that look good lit up:
 *  cyan, sky, electric blue, hot pink, orange, spring green, aqua. No yellow-green, purple or pure red. Edit the list to taste.
 *  It drives --neon (playhead, sliders, selected chips, current song bar, play button...) and the editor's track colours. */
export const NEONS = ['#00f0ff', '#2db7ff', '#3d7bff', '#ff2d95', '#ff7a1a', '#00ffa3', '#19ffd5']
const hashOf = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return h >>> 0 }

export function applySongColor(key: string | null | undefined) {
  const i = key ? hashOf(key) % NEONS.length : 0
  const r = document.documentElement.style
  r.setProperty('--neon', NEONS[i]); r.setProperty('--accent', NEONS[i])
  const order = [0, 3, 1, 4, 5, 2, 6]   // track colours: the song's neon first, then well-spread others from the same list
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

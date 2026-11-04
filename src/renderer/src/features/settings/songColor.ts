import { TRACK_COLORS } from '../../config/timeline'
import { useEditor } from '../../editor/editor.store'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'

/** Every song gets its own neon: a hue picked from its file path (always the same for the same song), full saturation, bright.
 *  It drives --neon (playhead, sliders, selected chips, current song bar, play button...) and the editor's track colours.
 *  Knobs: S / L below. */
const S = 100, L = 60
const hueOf = (key: string) => { let h = 2166136261; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return ((h >>> 0) % 360) }

export function applySongColor(key: string | null | undefined) {
  const hue = key ? hueOf(key) : 172          // no song: the default teal-neon
  const c = (h: number) => `hsl(${(h + 360) % 360} ${S}% ${L}%)`
  const r = document.documentElement.style
  r.setProperty('--neon', c(hue)); r.setProperty('--accent', c(hue))
  const steps = [0, 150, 60, 210, 300, 30, 100]   // track colours: spread round the wheel from the song's hue, still neon
  steps.forEach((d, i) => { TRACK_COLORS[i] = c(hue + d) })
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

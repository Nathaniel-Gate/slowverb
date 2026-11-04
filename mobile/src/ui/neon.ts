import { neonFor } from '@shared/neon'
import { useLibrary } from '../state/library.store'
import { songRel } from '../state/model'
import { usePlayer } from '../state/player.store'

/** Every song gets its own neon (same list and same pick rule as the Mac app: shared/neon.ts), keyed by the song's path. It sets --neon / --accent on the page,
 *  which the shared theme uses for thin-line highlights and small glows. Nothing playing: the variables are removed and the UI falls back to white. */
export function applyNeon(key: string | null) {
  const r = document.documentElement.style
  if (!key) { r.removeProperty('--neon'); r.removeProperty('--accent'); return }
  const c = neonFor(key)
  r.setProperty('--neon', c); r.setProperty('--accent', c)
}
export function bindNeon() {
  const go = () => {
    const cur = usePlayer.getState().cur, song = useLibrary.getState().songs.find((s) => s.id === cur)
    applyNeon(song ? songRel(song) : null)
  }
  usePlayer.subscribe((s, p) => { if (s.cur !== p.cur) go() })
  useLibrary.subscribe((s, p) => { if (s.songs !== p.songs) go() })
  go()
}

import { encodeWav } from '../../audio/wav'
import { renderVersion } from '../../audio/offline'
import { useEditor } from '../../editor/editor.store'
import { renderProject } from '../../editor/render'
import { effectiveFx, useFx } from '../fx/fx.store'
import { useLibrary } from '../library/library.store'
import { relOf, usePlaylists } from '../playlists/playlists.store'
import { usePlayer } from '../player/player.store'

/** Name suffix for a version, e.g. "0.80x-reverb" ("original" when nothing is applied). */
export const slug = (fx: { speed: number; wet: number }) => [fx.speed !== 1 && `${fx.speed.toFixed(2)}x`, fx.wet > 0 && 'reverb'].filter(Boolean).join('-') || 'original'

/** Render what the player is playing right now: the current EDIT if the song has one (exactly as the editor has it), otherwise the
 *  file with its speed/reverb version. Returns the WAV bytes plus a title and the playlist folder it belongs to. */
export async function renderCurrentWav(): Promise<{ wav: ArrayBuffer; title: string; edited: boolean; rel: string; fx: ReturnType<typeof effectiveFx> } | null> {
  const t = useLibrary.getState().tracks.find((x) => x.id === usePlayer.getState().cur); if (!t) return null
  const fx = effectiveFx(useFx.getState()), e = useEditor.getState(), edit = usePlayer.getState().viaEdit && e.sound()
  const rel = relOf(usePlaylists.getState().root, t.path) ?? ''
  if (edit) { const r = await renderProject(edit, e.buffers, { bitDepth: 16 }); return { wav: encodeWav(r.channels, r.rate, r.bitDepth), title: t.title, edited: true, rel, fx } }
  const r = await renderVersion(t.path, fx)
  return { wav: encodeWav(r.channels, r.rate), title: t.title, edited: false, rel, fx }
}

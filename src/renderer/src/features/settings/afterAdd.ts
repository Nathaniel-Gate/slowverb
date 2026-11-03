import { usePlayer } from '../player/player.store'
import { useSettings } from './settings.store'

/** A song was just added (drop, import or download). Start it only if the setting says so; otherwise make it ready (selected, paused)
 *  when nothing is selected yet, and leave whatever is current alone. */
export function afterAdd(id: string) {
  const p = usePlayer.getState()
  if (useSettings.getState().playAfterAdd) { if (!p.playing) p.play(id); return }
  if (!p.cur) p.select(id)
}

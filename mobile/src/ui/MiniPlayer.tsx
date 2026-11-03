import { usePlayer } from '../state/player.store'
import { useLibrary } from '../state/library.store'
import { Pause, Play } from './icons'

/** Slim bar above the bottom bar: title, play/pause, thin progress. Tap anywhere else to open Now Playing. */
export function MiniPlayer({ open }: { open(): void }) {
  const { cur, playing, pos, dur, toggle } = usePlayer()
  const song = useLibrary((s) => s.songs.find((x) => x.id === cur))
  if (!cur || !song) return null
  const frac = dur > 0 ? Math.min(1, pos / dur) : 0
  return (
    <div className="mini">
      <div className="mini-prog"><i style={{ transform: `scaleX(${frac})` }} /></div>
      <button className="mini-text" style={{ textAlign: 'left' }} onClick={open} aria-label="Open Now Playing">
        <div className="t">{song.title}</div><div className="a">{song.artist || 'Unknown artist'}</div>
      </button>
      <button className="icon-btn" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={22} /> : <Play size={22} />}</button>
    </div>
  )
}

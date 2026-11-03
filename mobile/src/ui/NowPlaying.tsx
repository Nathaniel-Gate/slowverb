import { useLibrary } from '../state/library.store'
import { usePlayer } from '../state/player.store'
import { UI } from './config'
import { Down, Next, Pause, Play, Prev, Skip } from './icons'
import { Seek } from './Seek'
import { VersionPanel } from './VersionPanel'

/** Full-screen sheet that slides up (transform only). Always mounted while a song is loaded so the exit animates too; inert when closed. */
export function NowPlaying({ open, onClose }: { open: boolean; onClose(): void }) {
  const { cur, playing, toggle, skip, next } = usePlayer()
  const song = useLibrary((s) => s.songs.find((x) => x.id === cur))
  if (!cur || !song) return null
  return (
    <div className={`np ${open ? 'open' : ''}`} inert={!open} aria-hidden={!open}>
      <div className="np-scroll">
        <div className="head">
          <button className="icon-btn" onClick={onClose} aria-label="Close Now Playing"><Down /></button>
          <span className="mono">NOW PLAYING</span>
          <span className="icon-btn" />
        </div>
        <div key={cur} className="np-titles">
          <h1 className="np-title">{song.title}</h1>
          <div className="np-artist">{song.artist || 'Unknown artist'}</div>
        </div>
        <Seek />
        <div className="transport">
          <button className="icon-btn" onClick={() => next(-1)} aria-label="Previous song"><Prev size={26} /></button>
          <button className="icon-btn" onClick={() => skip(-UI.skipSeconds)} aria-label={`Back ${UI.skipSeconds} seconds`}><Skip dir={-1} secs={UI.skipSeconds} /></button>
          <button className="play-big" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'}>{playing ? <Pause size={28} /> : <Play size={28} />}</button>
          <button className="icon-btn" onClick={() => skip(UI.skipSeconds)} aria-label={`Forward ${UI.skipSeconds} seconds`}><Skip dir={1} secs={UI.skipSeconds} /></button>
          <button className="icon-btn" onClick={() => next(1)} aria-label="Next song"><Next size={26} /></button>
        </div>
        <VersionPanel />
      </div>
    </div>
  )
}

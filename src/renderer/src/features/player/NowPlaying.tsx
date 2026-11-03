import { useFx } from '../fx/fx.store'
import { useLibrary } from '../library/library.store'
import { usePlayer } from './player.store'

export function NowPlaying() {
  const t = useLibrary((s) => s.tracks.find((x) => x.id === usePlayer.getState().cur))
  const cur = usePlayer((s) => s.cur)
  const track = useLibrary((s) => s.tracks.find((x) => x.id === cur)) ?? t
  const { fx, bypass } = useFx()
  return (
    <div>
      <span className="mono">01 / Now playing</span>
      <h1 className="title">{track?.title ?? 'Drop a song anywhere'}</h1>
      <div className="artist">{track ? track.artist : 'mp3 · m4a · wav · flac · ogg · folders too'}</div>
      {track && <><span className="tag mono">{(bypass ? 1 : fx.speed).toFixed(2)}x</span><span className="tag mono">Reverb {Math.round((bypass ? 0 : fx.wet) * 100)}%</span></>}
    </div>
  )
}

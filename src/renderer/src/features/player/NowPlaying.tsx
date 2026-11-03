import { useEditor } from '../../editor/editor.store'
import { useFx } from '../fx/fx.store'
import { useLibrary } from '../library/library.store'
import { usePlayer } from './player.store'

export function NowPlaying() {
  const t = useLibrary((s) => s.tracks.find((x) => x.id === usePlayer.getState().cur))
  const cur = usePlayer((s) => s.cur)
  const track = useLibrary((s) => s.tracks.find((x) => x.id === cur)) ?? t
  const { fx, bypass } = useFx(), viaEdit = usePlayer((s) => s.viaEdit), editName = useEditor((s) => s.project?.name)
  return (
    <div>
      <span className="mono">01 / Now playing</span>
      <h1 className="title" key={track?.id ?? 'none'}>{track?.title ?? 'Drop a song anywhere'}</h1>
      <div className="artist" key={(track?.id ?? 'none') + 'a'}>{track ? track.artist : 'mp3 · m4a · wav · flac · ogg · folders too'}</div>
      {track && <><span className="tag mono">{(bypass ? 1 : fx.speed).toFixed(2)}x</span>{viaEdit && <span className="tag mono tag-live" title="The player is playing your current edit, exactly as the editor has it">EDIT · {editName}</span>}<span className="tag mono">Reverb {Math.round((bypass ? 0 : fx.wet) * 100)}%</span><button className="tag mono tag-btn" title="Open this song in the editor" onClick={() => void useEditor.getState().openSong(track.path)}>Edit</button></>}
    </div>
  )
}

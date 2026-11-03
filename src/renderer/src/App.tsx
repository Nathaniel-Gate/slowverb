import { FxPanel } from './features/fx/FxPanel'
import { Playlist } from './features/library/Playlist'
import { useDrop } from './features/library/useDrop'
import { NowPlaying } from './features/player/NowPlaying'
import { Transport } from './features/player/Transport'
import { useShortcuts } from './features/player/useShortcuts'

export function App() {
  const { over, handlers } = useDrop()
  useShortcuts()
  return (
    <div className="app" {...handlers}>
      <div className="drag" />
      {over && <div className="drop"><span className="mono">Drop audio to add to playlist</span></div>}
      <main className="main">
        <NowPlaying />
        <div className="stack"><Transport /><FxPanel /></div>
      </main>
      <Playlist />
    </div>
  )
}

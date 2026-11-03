import { useEffect, useState } from 'react'
import { useLibrary } from './state/library.store'
import { usePlayer } from './state/player.store'
import { BottomBar, type Tab } from './ui/BottomBar'
import { Library } from './ui/Library'
import { MiniPlayer } from './ui/MiniPlayer'
import { NowPlaying } from './ui/NowPlaying'
import { Settings } from './ui/Settings'

export function App() {
  const [tab, setTab] = useState<Tab>('library')
  const [np, setNp] = useState(false)
  const cur = usePlayer((s) => s.cur)
  useEffect(() => { void useLibrary.getState().load() }, [])
  useEffect(() => { if (!cur) setNp(false) }, [cur])
  const open = () => { if (cur) setNp(true) }
  return (
    <div className="app phone">
      {tab === 'library' ? <Library openPlayer={open} /> : <Settings />}
      <MiniPlayer open={open} />
      <BottomBar tab={tab} setTab={setTab} openPlayer={open} />
      <NowPlaying open={np} onClose={() => setNp(false)} />
    </div>
  )
}

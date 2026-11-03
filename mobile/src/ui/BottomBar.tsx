import { usePlayer } from '../state/player.store'
import { Gear, Lib, Wave } from './icons'

export type Tab = 'library' | 'settings'
export function BottomBar({ tab, setTab, openPlayer }: { tab: Tab; setTab(t: Tab): void; openPlayer(): void }) {
  const cur = usePlayer((s) => s.cur)
  return (
    <nav className="bar-nav" aria-label="Main">
      <button className={`tab ${tab === 'library' ? 'on' : ''}`} onClick={() => setTab('library')}><Lib />LIBRARY</button>
      <button className="tab" onClick={openPlayer} disabled={!cur}><Wave />PLAYING</button>
      <button className={`tab ${tab === 'settings' ? 'on' : ''}`} onClick={() => setTab('settings')}><Gear />SETTINGS</button>
    </nav>
  )
}

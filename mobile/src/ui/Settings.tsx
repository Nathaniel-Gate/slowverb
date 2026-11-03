import { useLibrary } from '../state/library.store'
import { useSettings } from '../state/settings.store'
import { fmtSize } from './format'

function Toggle({ label, note, on, onChange }: { label: string; note: string; on: boolean; onChange(v: boolean): void }) {
  return (
    <button className="set-row" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="set-text"><span className="set-label">{label}</span><span className="set-note">{note}</span></span>
      <span className={`switch ${on ? 'on' : ''}`}><i /></span>
    </button>
  )
}

export function Settings() {
  const { autoAdvance, playOnTap, set } = useSettings()
  const songs = useLibrary((s) => s.songs)
  const bytes = songs.reduce((a, s) => a + s.size, 0)
  return (
    <div className="screen">
      <div className="head"><span className="mono">SLOWVERB</span></div>
      <h1 className="h1">Settings</h1>
      <div className="panel set-panel">
        <span className="mono">01 / Playback</span>
        <Toggle label="Auto-advance" note="Play the next song when one ends." on={autoAdvance} onChange={(v) => set({ autoAdvance: v })} />
        <Toggle label="Play on tap" note="Tap a song to start it. Off: tap opens its options first." on={playOnTap} onChange={(v) => set({ playOnTap: v })} />
      </div>
      <div className="panel set-panel">
        <span className="mono">02 / Library</span>
        <div className="set-row static"><span className="set-label">Songs</span><span className="mono val">{songs.length}</span></div>
        <div className="set-row static"><span className="set-label">Stored on this phone</span><span className="mono val">{fmtSize(bytes)}</span></div>
        <p className="set-note pad">Songs from <b>iCloud Drive &gt; Slowverb Phone</b> are copied in when you import them, so they keep playing offline.</p>
      </div>
    </div>
  )
}

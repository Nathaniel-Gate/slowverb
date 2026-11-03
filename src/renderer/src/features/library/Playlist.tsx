import { useState } from 'react'
import { fmt } from '../../lib/format'
import { usePlayer } from '../player/player.store'
import { useLibrary } from './library.store'

export function Playlist() {
  const { tracks, remove, move } = useLibrary()
  const { cur, play } = usePlayer()
  const [drag, setDrag] = useState<number | null>(null)
  return (
    <aside className="side">
      <div className="side-head"><span className="mono">Playlist · {tracks.length}</span></div>
      <div className="list">
        {!tracks.length && <div className="empty mono">Empty.<br />Drag audio files or folders into the window.</div>}
        {tracks.map((t, i) => (
          <div key={t.id} draggable className={`item ${t.id === cur ? 'cur' : ''}`}
            onDragStart={() => setDrag(i)} onDragOver={(e) => { if (drag !== null) e.preventDefault() }}
            onDrop={(e) => { if (drag !== null) { e.preventDefault(); e.stopPropagation(); move(drag, i); setDrag(null) } }}
            onClick={() => play(t.id)} onContextMenu={(e) => { e.preventDefault(); if (t.id === cur) usePlayer.getState().stop(); remove(t.id) }}>
            <span className="n">{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}><div className="t">{t.title}</div><div className="a">{[t.artist, t.fx && t.fx.speed !== 1 ? `${t.fx.speed.toFixed(2)}x` : ''].filter(Boolean).join(' · ')}</div></div>
            <span className="n">{fmt(t.duration)}</span>
          </div>
        ))}
      </div>
      <div className="side-head"><span className="mono">Right-click removes · drag reorders</span></div>
    </aside>
  )
}

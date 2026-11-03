import { useEditor } from '../../editor/editor.store'
import { fmt } from '../../lib/format'
import { useFlip } from '../../ui/useFlip'
import { DownloadBar } from '../download/DownloadBar'
import { PlaylistTree } from '../playlists/PlaylistTree'
import { relOf, usePlaylists } from '../playlists/playlists.store'
import { usePlayer } from '../player/player.store'
import { useLibrary } from './library.store'

const TRACK_MIME = 'application/x-slowverb-track'

export function Playlist() {
  const { tracks, remove, moveBefore } = useLibrary()
  const { cur, play, playing } = usePlayer()
  const { root, sel } = usePlaylists()
  const list = useFlip<HTMLDivElement>()
  const shown = sel === null ? tracks : tracks.filter((t) => relOf(root, t.path) === sel)
  const title = sel === null ? 'All songs' : sel === '' ? 'Unsorted' : sel.slice(sel.lastIndexOf('/') + 1)
  return (
    <aside className="side">
      <PlaylistTree />
      <DownloadBar />
      <div className="side-head"><span className="mono">{title} · {shown.length}</span></div>
      <div className="list" ref={list}>
        {!shown.length && <div className="empty mono">Empty.<br />Drag audio files here, or paste a link above.</div>}
        {shown.map((t, i) => (
          <div key={t.id} data-flip={t.id} draggable className={`item ${t.id === cur ? 'cur' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 24}ms` }}
            onDragStart={(e) => { e.dataTransfer.setData(TRACK_MIME, t.id); e.dataTransfer.effectAllowed = 'move' }}
            onDragOver={(e) => { if (e.dataTransfer.types.includes(TRACK_MIME)) e.preventDefault() }}
            onDrop={(e) => { const id = e.dataTransfer.getData(TRACK_MIME); if (id) { e.preventDefault(); e.stopPropagation(); moveBefore(id, t.id) } }}
            onClick={() => play(t.id)} onDoubleClick={() => void useEditor.getState().openSong(t.path)} onContextMenu={(e) => { e.preventDefault(); if (t.id === cur) usePlayer.getState().stop(); remove(t.id) }}>
            <span className="n">{t.id === cur ? <span className={`eq ${playing ? '' : 'paused'}`}><i /><i /><i /></span> : String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}><div className="t">{t.title}</div><div className="a">{[t.artist, t.fx && t.fx.speed !== 1 ? `${t.fx.speed.toFixed(2)}x` : ''].filter(Boolean).join(' · ')}</div></div>
            <span className="n">{fmt(t.duration)}</span>
          </div>
        ))}
      </div>
      <div className="side-head"><span className="mono">Double-click edits · right-click removes · drag to a playlist to move</span></div>
    </aside>
  )
}

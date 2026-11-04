import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CATEGORIES } from '../../../../shared/config'
import { categoryOf } from '../../../../shared/libraryModel'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'
import { fileRel, usePlaylists } from '../playlists/playlists.store'
import { catOfList, useLists } from './lists.store'

/** Right-click on a song: join/leave playlists (menu stays open so several can be ticked), change its home, reveal, trash. */
export function SongMenu({ id, x, y, inList, onClose }: { id: string; x: number; y: number; inList: string | null; onClose(): void }) {
  const t = useLibrary((s) => s.tracks.find((q) => q.id === id)), root = usePlaylists((s) => s.root), { lists, toggle, removeSong } = useLists()
  const [ask, setAsk] = useState(false)   // delete needs a second, deliberate click
  if (!t) return null
  const rel = fileRel(root, t.path), home = rel ? categoryOf(rel) : null
  const trash = async () => {
    onClose(); if (usePlayer.getState().cur === id) usePlayer.getState().stop()
    await window.api.trashSong(t.path); await usePlaylists.getState().refresh()
  }
  return createPortal(   // to <body>: the sidebar card creates its own containing block, which would shift a fixed menu off-screen
    <div className="menu song-menu" style={{ left: Math.min(x, innerWidth - 230), top: Math.min(y, Math.max(8, innerHeight - 60 - 34 * (lists.length + CATEGORIES.length + 4))) }} onClick={(e) => e.stopPropagation()}>
      {lists.length > 0 && <div className="menu-h mono">PLAYLISTS</div>}
      {rel && lists.filter((l) => !home || catOfList(l) === home || l.songs.includes(rel)).map((l) => (
        <button key={l.id} className="menu-check" onClick={() => toggle(l.id, rel)}><span className={`ap-box ${l.songs.includes(rel) ? 'on' : ''}`}><i /></span>{l.name}</button>
      ))}
      <div className="menu-h mono">HOME</div>
      {CATEGORIES.map((c) => (
        <button key={c} className="menu-check" onClick={() => { onClose(); if (home !== c) void usePlaylists.getState().moveTrack(id, c) }}><span className={`ap-dot ${home === c ? 'on' : ''}`} />{c}</button>
      ))}
      <div className="menu-sep" />
      {inList && rel && <button onClick={() => { removeSong(inList, rel); onClose() }}>Remove from this playlist</button>}
      <button onClick={() => { void window.api.reveal(t.path); onClose() }}>Reveal in Finder</button>
      {!ask
        ? <button className="danger menu-trash" onClick={() => setAsk(true)}><svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M2.5 4h9M5.5 4V2.5h3V4M3.8 4l.5 7.5h5.4l.5-7.5" /></svg>Delete song</button>
        : <div className="menu-confirm"><div className="mono">Move "{t.title}" to the Trash?</div><div><button onClick={() => setAsk(false)}>Cancel</button><button className="danger solid" onClick={trash}>Delete</button></div></div>}
    </div>,
    document.body
  )
}

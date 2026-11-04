import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CATEGORIES } from '../../../../shared/config'
import { categoryOf } from '../../../../shared/libraryModel'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'
import { fileRel, usePlaylists } from '../playlists/playlists.store'
import { catOfList, useLists } from './lists.store'

/** Right-click on a song: join/leave playlists (menu stays open so several can be ticked), change its home, reveal, trash. */
export function SongMenu({ id, x, y, open, inList, onClose }: { id: string; x: number; y: number; open: boolean; inList: string | null; onClose(): void }) {
  const t = useLibrary((s) => s.tracks.find((q) => q.id === id)), root = usePlaylists((s) => s.root), { lists, toggle, removeSong } = useLists()
  const [ask, setAsk] = useState(false)   // delete needs a second, deliberate click
  const [on, setOn] = useState(false), [top, setTop] = useState<number | null>(null), box = useRef<HTMLDivElement>(null)
  useEffect(() => { const r = requestAnimationFrame(() => setOn(open)); return () => cancelAnimationFrame(r) }, [open])   // fade/slide in after mount, out when closing
  useEffect(() => setAsk(false), [id])
  useLayoutEffect(() => { const h = box.current?.offsetHeight ?? 0; setTop(Math.max(8, Math.min(y, innerHeight - h - 8))) }, [y, id, lists.length, ask])   // follows the clicked song's dots, always fully on screen
  if (!t) return null
  const sideLeft = document.querySelector('.side')?.getBoundingClientRect().left ?? innerWidth - 360   // opens to the LEFT of the song list so it never covers other songs
  const rel = fileRel(root, t.path), home = rel ? categoryOf(rel) : null
  const trash = async () => {
    onClose(); if (usePlayer.getState().cur === id) usePlayer.getState().stop()
    await window.api.trashSong(t.path); await usePlaylists.getState().refresh()
  }
  return createPortal(   // to <body>: the sidebar card creates its own containing block, which would shift a fixed menu off-screen
    <div ref={box} className={`menu song-menu ${on ? 'on' : ''} ${top !== null && on ? 'placed' : ''}`} style={{ right: innerWidth - sideLeft + 24, width: 240, top: top ?? y }} onClick={(e) => e.stopPropagation()}>
      <div key={id} className="sm-body">
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
      </div>
      <div className="menu-sep" />
      <button className="menu-done mono" onClick={onClose}>DONE</button>
    </div>,
    document.body
  )
}

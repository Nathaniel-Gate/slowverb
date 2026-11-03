import { useRef, useState } from 'react'
import type { Song } from './types'
import { UI } from './config'
import { fmtTime, fxTag } from './format'
import { Eq } from './icons'

type Props = {
  song: Song; index: number; current: boolean; playing: boolean; open: boolean
  onTap(): void; onLong(): void; onOpen(open: boolean): void; onEdit(): void; onDelete(): void
}

/** One library row: tap = play, hold = action sheet, swipe left = EDIT / DELETE. Pointer events + touch-action: pan-y so vertical scroll stays native. */
export function SongRow({ song, index, current, playing, open, onTap, onLong, onOpen, onEdit, onDelete }: Props) {
  const [drag, setDrag] = useState<number | null>(null)   // px offset while a finger is down on a horizontal swipe
  const [sure, setSure] = useState(false)                 // DELETE asks twice
  const g = useRef({ x: 0, y: 0, mode: '' as '' | 'h' | 'v', long: false, timer: 0, id: -1 })
  const tag = fxTag(song.fx)
  const rest = open ? -UI.swipeReveal : 0

  const down = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const s = g.current; s.x = e.clientX; s.y = e.clientY; s.mode = ''; s.long = false; s.id = e.pointerId
    window.clearTimeout(s.timer)
    s.timer = window.setTimeout(() => { if (!s.mode) { s.long = true; onLong() } }, UI.longPressMs)
  }
  const move = (e: React.PointerEvent) => {
    const s = g.current; if (s.id !== e.pointerId) return
    const dx = e.clientX - s.x, dy = e.clientY - s.y
    if (!s.mode && (Math.abs(dx) > UI.swipeSlop || Math.abs(dy) > UI.swipeSlop)) {
      window.clearTimeout(s.timer)
      s.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v'
      if (s.mode === 'h') e.currentTarget.setPointerCapture(e.pointerId)
    }
    if (s.mode === 'h') setDrag(Math.max(-UI.swipeReveal, Math.min(0, rest + dx)))
  }
  const up = (e: React.PointerEvent) => {
    const s = g.current; if (s.id !== e.pointerId) return
    window.clearTimeout(s.timer); s.id = -1
    if (s.mode === 'h' && drag !== null) { onOpen(drag < -UI.swipeReveal / 2); setSure(false) }
    else if (!s.mode && !s.long) { if (open) onOpen(false); else onTap() }
    setDrag(null)
  }
  const cancel = () => { window.clearTimeout(g.current.timer); g.current.id = -1; setDrag(null) }

  return (
    <li className={`song ${current ? 'cur' : ''}`}>
      <div className="song-actions">
        <button className="act" tabIndex={open ? 0 : -1} onClick={() => { onOpen(false); onEdit() }}>EDIT</button>
        <button className={`act del ${sure ? 'sure' : ''}`} tabIndex={open ? 0 : -1} onClick={() => (sure ? onDelete() : setSure(true))}>{sure ? 'SURE?' : 'DELETE'}</button>
      </div>
      <div className={`song-body ${drag !== null ? 'dragging' : ''}`} style={{ transform: `translateX(${drag ?? rest}px)` }}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onContextMenu={(e) => e.preventDefault()}
        role="button" aria-label={`${song.title}${song.artist ? ' by ' + song.artist : ''}`}>
        <span className="n">{current ? <Eq paused={!playing} /> : String(index + 1).padStart(2, '0')}</span>
        <span className="meta"><span className="t">{song.title}</span><span className="a">{song.artist || 'Unknown artist'}</span></span>
        <span className="side-r"><span className="d">{fmtTime(song.duration)}</span>{tag && <span className="vtag">{tag}</span>}</span>
      </div>
    </li>
  )
}

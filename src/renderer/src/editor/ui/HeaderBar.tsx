import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../../features/library/library.store'
import { usePlayer } from '../../features/player/player.store'
import { useEditor } from '../editor.store'
import { canRedo, canUndo } from '../history'
import { editorTransport } from '../transport'

const tc = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, '0')}`
const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')

/** PLAYER | EDITOR switch for the top drag area. The pill slides between the two halves with a transform. */
export function ModeSwitch() {
  const open = useEditor((s) => s.open), cur = usePlayer((s) => s.cur)
  const path = useLibrary((s) => s.tracks.find((t) => t.id === cur)?.path)
  const hasProject = useEditor((s) => !!s.project)
  const goEditor = () => { const s = useEditor.getState(); if (s.open) return; if (s.project && (!path || s.project.song === path)) s.show(); else if (path) void s.openSong(path) }
  const canEdit = open || hasProject || !!path
  return (
    <div className="mode" data-on={open ? 'editor' : 'player'}>
      <div className="mode-pill" />
      <button className={!open ? 'on' : ''} onClick={() => useEditor.getState().close()}>PLAYER</button>
      <button className={open ? 'on' : ''} disabled={!canEdit} onClick={goEditor}>EDITOR</button>
    </div>
  )
}

/** Click-to-edit text. Enter or blur commits, Escape cancels. */
function Name({ value, onCommit, label }: { value: string; onCommit: (v: string) => void; label: string }) {
  const [editing, setEditing] = useState(false)
  if (!editing) return <button className="ed-name" title={`Rename ${label}`} onClick={() => setEditing(true)}>{value}</button>
  const done = (v: string) => { setEditing(false); if (v.trim() && v.trim() !== value) onCommit(v.trim()) }
  return (
    <input autoFocus className="pl-input ed-name-in" defaultValue={value} spellCheck={false} size={Math.max(8, value.length + 2)}
      onFocus={(e) => e.currentTarget.select()} onBlur={(e) => done(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') done(e.currentTarget.value) }} />
  )
}

function Timecode() {
  const ref = useRef<HTMLSpanElement>(null), playing = useEditor((s) => s.playing), playhead = useEditor((s) => s.playhead)
  useEffect(() => {
    const el = ref.current; if (!el) return
    if (!playing) { el.textContent = tc(playhead); return }
    let id = 0; const frame = () => { el.textContent = tc(editorTransport.position()); id = requestAnimationFrame(frame) }
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id)
  }, [playing, playhead])
  return <span className="ed-tc" ref={ref}>0:00.000</span>
}

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving', dirty: 'Unsaved' } as const

export function HeaderBar() {
  const { project, hist, saveState, busy, note, playing } = useEditor()
  const { close, undo, redo, togglePlay, renderToLibrary, renameSong, renameVersion } = useEditor.getState()
  if (!project || !hist) return <div className="ed-head" />
  const status = busy ?? note ?? SAVE_LABEL[saveState]
  return (
    <div className="ed-head">
      <button className="ghost ed-back" onClick={close} title="Back to player">&larr; PLAYER</button>
      <span className="ed-sep" />
      <div className="ed-names">
        <Name value={baseName(project.song)} label="song" onCommit={(v) => void renameSong(v)} />
        <span className="mono">/</span>
        <Name value={project.name} label="version" onCommit={(v) => void renameVersion(v)} />
      </div>
      <div className="ed-grow" />
      <button className="ghost ed-play" onClick={() => void togglePlay()} title="Play / pause (Space)">{playing ? 'PAUSE' : 'PLAY'}</button>
      <Timecode />
      <span className="ed-sep" />
      <span className={`ed-status mono ${busy ? 'busy' : ''} ${note && !busy ? 'note' : ''} ${saveState}`}>
        <i className="ed-dot" /><span key={status} className="ed-status-t">{status}</span>
      </span>
      <button className="ghost" disabled={!canUndo(hist)} onClick={undo} title="Undo (Cmd+Z)">UNDO</button>
      <button className="ghost" disabled={!canRedo(hist)} onClick={redo} title="Redo (Shift+Cmd+Z)">REDO</button>
      <button className="ed-render" disabled={!!busy} onClick={() => void renderToLibrary()} title="Render this edit to a new song in the library">RENDER</button>
      <div className={`ed-busy ${busy ? 'on' : ''}`}><div className="bar-ind" /></div>
    </div>
  )
}

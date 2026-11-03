import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../../features/library/library.store'
import { usePlayer } from '../../features/player/player.store'
import { keysOf } from '../commands'
import { useEditor } from '../editor.store'
import { canRedo, canUndo } from '../history'
import { formatKey } from '../keyparse'
import { useOverlay } from '../overlayStore'
import { fmtTime, parseTime } from '../timefmt'
import { editorTransport } from '../transport'
import { HistoryPopover } from './HistoryPopover'
import { Overlays } from './Overlays'
import { RenderOptions } from './RenderOptions'
import { VersionMenu } from './VersionMenu'

const baseName = (p: string) => p.slice(p.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '')
/** Tooltip text with the command's current shortcut, so rebinds show up. */
const tip = (text: string, id: string) => { const k = keysOf(id)[0]; return k ? `${text} (${formatKey(k)})` : text }

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

/** Click-to-edit text. Enter or blur commits, Escape cancels. `editing` can be driven from outside (version menu > Rename). */
function Name({ value, onCommit, label, editing, setEditing }: { value: string; onCommit: (v: string) => void; label: string; editing: boolean; setEditing: (e: boolean) => void }) {
  if (!editing) return <button className="ed-name" title={`Rename ${label}`} onClick={() => setEditing(true)}>{value}</button>
  const done = (v: string) => { setEditing(false); if (v.trim() && v.trim() !== value) onCommit(v.trim()) }
  return (
    <input autoFocus className="pl-input ed-name-in" defaultValue={value} spellCheck={false} size={Math.max(8, value.length + 2)}
      onFocus={(e) => e.currentTarget.select()} onBlur={(e) => done(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') done(e.currentTarget.value) }} />
  )
}

/** Live timecode. Click it to type a time (1:23.456 or 83.4) and jump there. */
function Timecode() {
  const ref = useRef<HTMLButtonElement>(null), playing = useEditor((s) => s.playing), playhead = useEditor((s) => s.playhead), [typing, setTyping] = useState(false)
  useEffect(() => {
    const el = ref.current; if (!el || typing) return
    if (!playing) { el.textContent = fmtTime(playhead); return }
    let id = 0; const frame = () => { el.textContent = fmtTime(editorTransport.position()); id = requestAnimationFrame(frame) }
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id)
  }, [playing, playhead, typing])
  if (typing) {
    const go = (v: string) => { setTyping(false); const t = parseTime(v); if (t === null) useEditor.getState().showToast('Not a time. Try 1:23.456'); else useEditor.getState().gotoTime(t) }
    return <input autoFocus className="pl-input ed-tc-in mono" defaultValue={fmtTime(useEditor.getState().now())} spellCheck={false}
      onFocus={(e) => e.currentTarget.select()} onBlur={(e) => go(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Escape') setTyping(false); if (e.key === 'Enter') go(e.currentTarget.value) }} />
  }
  return <button className="ed-tc" ref={ref} title="Click to type a time" onClick={() => setTyping(true)}>0:00.000</button>
}

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving', dirty: 'Unsaved' } as const

export function HeaderBar() {
  const project = useEditor((s) => s.project), hist = useEditor((s) => s.hist), saveState = useEditor((s) => s.saveState), busy = useEditor((s) => s.busy)
  const playing = useEditor((s) => s.playing), loop = useEditor((s) => s.loop), dockOpen = useEditor((s) => s.dockOpen)
  const { close, undo, redo, togglePlay, renderToLibrary, renameSong, renameVersion, toggleLoop, setDock } = useEditor.getState()
  const [verOpen, setVerOpen] = useState(false), [renOpen, setRenOpen] = useState(false), [renameVer, setRenameVer] = useState(false), [renameSongOn, setRenameSongOn] = useState(false)
  const verRef = useRef<HTMLDivElement>(null), renRef = useRef<HTMLButtonElement>(null), histRef = useRef<HTMLButtonElement>(null)
  const histOpen = useOverlay((s) => s.history)
  if (!project || !hist) return <div className="ed-head"><Overlays /></div>
  const status = busy ?? SAVE_LABEL[saveState]
  return (
    <div className="ed-head">
      <button className="ghost ed-back" onClick={close} title="Back to player">&larr; PLAYER</button>
      <span className="ed-sep" />
      <div className="ed-names">
        <Name value={baseName(project.song)} label="song" editing={renameSongOn} setEditing={setRenameSongOn} onCommit={(v) => void renameSong(v)} />
        <span className="mono">/</span>
        <div className="ed-ver-wrap" ref={verRef}>
          <Name value={project.name} label="version" editing={renameVer} setEditing={setRenameVer} onCommit={(v) => void renameVersion(v)} />
          {!renameVer && <button className={`ed-caret ${verOpen ? 'on' : ''}`} title="Versions" onClick={() => setVerOpen((o) => !o)}><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg></button>}
        </div>
        <VersionMenu anchor={verRef} open={verOpen} onClose={() => setVerOpen(false)} onRename={() => setRenameVer(true)} />
      </div>
      <div className="ed-grow" />
      <button className={`ghost ed-mini ${loop ? 'on' : ''}`} onClick={toggleLoop} title={tip('Loop In to Out, or the whole edit', 'loop')}>LOOP</button>
      <button className="ghost ed-mini" onClick={() => useOverlay.getState().set({ palette: true })} title={tip('Command palette', 'palette')}>COMMANDS</button>
      <span className="ed-sep" />
      <button className="ghost ed-play" onClick={() => void togglePlay()} title={tip('Play / pause', 'play')}>{playing ? 'PAUSE' : 'PLAY'}</button>
      <Timecode />
      <span className="ed-sep" />
      <span className={`ed-status mono ${busy ? 'busy' : ''} ${saveState}`}>
        <i className="ed-dot" /><span key={status} className="ed-status-t">{status}</span>
      </span>
      <button className="ghost" disabled={!canUndo(hist)} onClick={undo} title={tip('Undo', 'undo')}>UNDO</button>
      <button className="ghost" disabled={!canRedo(hist)} onClick={redo} title={tip('Redo', 'redo')}>REDO</button>
      <button className={`ghost ed-caret ${histOpen ? 'on' : ''}`} ref={histRef} onClick={() => useOverlay.getState().set({ history: !histOpen })} title={tip('Undo history', 'history')}>
        <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 3.2V6l2 1.3M1.6 6a4.4 4.4 0 108.8 0 4.4 4.4 0 00-8.8 0" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <span className="ed-render-group">
        <button className="ed-render" disabled={!!busy} onClick={() => void renderToLibrary()} title={tip('Render this edit to a new song in the library', 'render')}>RENDER</button>
        <button className={`ed-render ed-render-opt ${renOpen ? 'on' : ''}`} ref={renRef} disabled={!!busy} onClick={() => setRenOpen((o) => !o)} title="Render options">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </span>
      <button className={`ghost ed-mini ${dockOpen ? 'on' : ''}`} onClick={() => setDock(dockOpen ? null : useEditor.getState().dockTab)} title="Show or hide the side panels (Alt+0 hides)">PANELS</button>
      <div className={`ed-busy ${busy ? 'on' : ''}`}><div className="bar-ind" /></div>
      <RenderOptions anchor={renRef} open={renOpen} onClose={() => setRenOpen(false)} />
      <HistoryPopover anchor={histRef} />
      <Overlays />
    </div>
  )
}

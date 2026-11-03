import { useEffect, useState } from 'react'
import { EDITOR } from '../../config/editorKeys'
import { TL } from '../../config/timeline'
import type { Track } from '../model'
import { useEditor } from '../editor.store'
import * as ops from '../ops'

function Gain({ track }: { track: Track }) {
  const [v, setV] = useState(track.gain), apply = useEditor.getState().apply
  useEffect(() => setV(track.gain), [track.gain])
  const commit = () => { if (v !== track.gain) apply((p) => ops.setTrack(p, track.id, { gain: v })) }   // one history step per drag, not per tick
  return <input type="range" min={0} max={1.5} step={0.01} value={v} title={`Track gain ${Math.round(v * 100)}%`} style={{ '--p': `${(v / 1.5) * 100}%` } as React.CSSProperties}
    onChange={(e) => setV(+e.target.value)} onPointerUp={commit} onKeyUp={commit} onBlur={commit} onDoubleClick={() => { setV(1); apply((p) => ops.setTrack(p, track.id, { gain: 1 })) }} />
}

function TrackName({ track }: { track: Track }) {
  const [editing, setEditing] = useState(false), apply = useEditor.getState().apply
  const done = (v: string) => { setEditing(false); if (v.trim() && v.trim() !== track.name) apply((p) => ops.setTrack(p, track.id, { name: v.trim() })) }
  return editing
    ? <input autoFocus className="pl-input" defaultValue={track.name} spellCheck={false} onFocus={(e) => e.currentTarget.select()} onBlur={(e) => done(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') done(e.currentTarget.value) }} />
    : <span className="ed-tname" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>{track.name}</span>
}

/** Left column. Same row order and lane height as the Timeline (TL.laneH); the scroller is mirrored by the Timeline via data-sync-scroll-y. */
export function TrackHeaders() {
  const tracks = useEditor((s) => s.project?.tracks ?? []), apply = useEditor.getState().apply
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])
  const flag = (t: Track, k: 'mute' | 'solo' | 'lock', label: string, tip: string) =>
    <button className={`ed-flag mono ${t[k] ? 'on ' + k : ''}`} title={tip} onClick={() => apply((p) => ops.setTrack(p, t.id, { [k]: !t[k] }))}>{label}</button>
  return (
    <div className="ed-th" style={{ width: EDITOR.headerW, '--lane-h': TL.laneH + 'px', '--ruler-h': TL.rulerH + 'px' } as React.CSSProperties}>
      <div className="ed-th-ruler"><span className="mono">Tracks</span><button className="ghost" title="Add a track" onClick={() => apply((p) => ops.addTrack(p))}>+ TRACK</button></div>
      <div className="ed-th-scroll" {...{ [TL.syncAttr]: '' }}>
        {tracks.map((t, i) => (
          <div key={t.id} className={`ed-th-row ${t.lock ? 'locked' : ''}`} style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: t.id }) }}>
            <TrackName track={t} />
            <div className="ed-flags">{flag(t, 'mute', 'M', 'Mute')}{flag(t, 'solo', 'S', 'Solo')}{flag(t, 'lock', 'L', 'Lock')}</div>
            <Gain track={t} />
          </div>
        ))}
      </div>
      {menu && (
        <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { apply((p) => ops.addTrack(p)); setMenu(null) }}>Add track</button>
          <button className="danger" disabled={tracks.length < 2} onClick={() => { apply((p) => ops.removeTrack(p, menu.id)); setMenu(null) }}>Delete track</button>
        </div>
      )}
    </div>
  )
}

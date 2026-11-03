import { useEffect, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { EDITOR } from '../../config/editorKeys'
import { TL, trackColor } from '../../config/timeline'
import type { Track } from '../model'
import { useEditor } from '../editor.store'
import * as ops from '../ops'
import { TimeField } from './TimeField'
import { TrackFxButton } from './TrackFx'
import { useLaneLive } from './laneLive'
import { clamp, laneHeight } from './timelineMath'
import { trackMenu } from './timelineMenus'

const blurOnUp = (e: RPointerEvent<HTMLElement>) => e.currentTarget.blur()   // keep Space/Enter for the editor keys, not the last button

function Gain({ track }: { track: Track }) {
  const [v, setV] = useState(track.gain), apply = useEditor.getState().apply
  useEffect(() => setV(track.gain), [track.gain])
  const commit = () => { if (v !== track.gain) apply((p) => ops.setTrack(p, track.id, { gain: v })) }   // one history step per drag, not per tick
  return <input type="range" min={0} max={1.5} step={0.01} value={v} title={`Track gain ${Math.round(v * 100)}%`} style={{ '--p': `${(v / 1.5) * 100}%` } as CSSProperties}
    onChange={(e) => setV(+e.target.value)} onPointerUp={commit} onKeyUp={commit} onBlur={commit} onDoubleClick={() => { setV(1); apply((p) => ops.setTrack(p, track.id, { gain: 1 })) }} />
}

function TrackName({ track }: { track: Track }) {
  const [editing, setEditing] = useState(false), apply = useEditor.getState().apply
  const done = (v: string) => { setEditing(false); if (v.trim() && v.trim() !== track.name) apply((p) => ops.setTrack(p, track.id, { name: v.trim() })) }
  return editing
    ? <input autoFocus className="pl-input" defaultValue={track.name} spellCheck={false} onFocus={(e) => e.currentTarget.select()} onBlur={(e) => done(e.currentTarget.value)}
        onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') setEditing(false); if (e.key === 'Enter') done(e.currentTarget.value) }} />
    : <span className="ed-tname" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>{track.name}</span>
}

/** Bottom edge of a header row: drag to resize the track (live through laneLive, one history step on release); double-click resets. */
function Grip({ track }: { track: Track }) {
  const down = (e: RPointerEvent) => {
    e.preventDefault()
    const y0 = e.clientY, h0 = laneHeight(track), { setLive } = useLaneLive.getState()
    let h = h0
    const move = (ev: PointerEvent) => { h = clamp(h0 + ev.clientY - y0, TL.laneMinH, TL.laneMaxH); setLive(track.id, h) }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      if (h !== h0 || track.collapsed) useEditor.getState().apply(p => ops.setTrack(p, track.id, { height: h, collapsed: false }))
      setLive(track.id, null)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return <div className="tl-th-grip" title="Drag to resize, double-click to reset" onPointerDown={down}
    onDoubleClick={() => useEditor.getState().apply(p => ops.setTrack(p, track.id, { height: undefined, collapsed: false }))} />
}

/** Left column. Same row order and heights as the Timeline lanes (layout in timelineMath); the scroller is mirrored by the Timeline via data-sync-scroll-y. */
/** Option + drag down in the empty space below the last header: previews NEW TRACK rows, creates them on release. */
function useGhostTracks() {
  const [ghost, setGhost] = useState(0)
  const down = (e: RPointerEvent<HTMLElement>) => {
    if (!e.altKey || e.button !== 0 || (e.target as Element).closest('.ed-th-row, .ed-th-ruler')) return
    e.preventDefault()
    const y0 = e.clientY; let n = 0
    const move = (ev: PointerEvent) => { const dy = ev.clientY - y0; n = dy < 4 ? 0 : clamp(1 + Math.floor(dy / TL.laneH), 1, TL.maxNewTracks); setGhost(n) }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setGhost(0)
      if (!n) return
      useEditor.getState().apply((p) => { let o = p; for (let i = 0; i < n; i++) o = ops.addTrack(o); return o })
      useEditor.getState().showToast(`Added ${n} track${n > 1 ? 's' : ''}`)
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return { ghost, down }
}

export function TrackHeaders() {
  const { ghost, down } = useGhostTracks()
  const tracks = useEditor((s) => s.project?.tracks ?? []), syncLock = useEditor((s) => s.project?.syncLock !== false), tidy = useEditor((s) => !!s.project?.autoDeleteEmpty)
  const live = useLaneLive(s => s.live)
  const apply = useEditor.getState().apply
  const flag = (t: Track, k: 'mute' | 'solo' | 'lock', label: string, tip: string) =>
    <button className={`ed-flag mono ${t[k] ? 'on ' + k : ''}`} title={tip} onPointerUp={blurOnUp} onClick={() => apply((p) => ops.setTrack(p, t.id, { [k]: !t[k] }))}>{label}</button>
  return (
    <div className="ed-th" onPointerDown={down} style={{ width: EDITOR.headerW, '--lane-h': TL.laneH + 'px', '--ruler-h': TL.rulerH + 'px' } as CSSProperties}>
      <div className="ed-th-ruler tl-th-corner">
        <TimeField />
        <button className={`ed-flag mono tl-sync ${syncLock ? 'on' : ''}`} title="Sync lock: ripple edits also shift the other tracks" onPointerUp={blurOnUp} onClick={() => useEditor.getState().toggleSyncLock()}>SYNC</button>
        <button className="ghost" title="Add a track" onPointerUp={blurOnUp} onClick={() => apply((p) => ops.addTrack(p))}>+</button>
      </div>
      <div className="ed-th-scroll" {...{ [TL.syncAttr]: '' }}>
        {tracks.map((t, i) => {
          const h = laneHeight(t, live[t.id]), tight = h < TL.detailMinH + 6
          return (
            <div key={t.id} className={`ed-th-row tl-th-row ${t.lock ? 'locked' : ''}`} data-tight={tight || undefined} data-collapsed={t.collapsed || undefined}
              style={{ height: h, animationDelay: `${Math.min(i, 8) * 40}ms`, '--stripe': trackColor(i) } as CSSProperties}
              onContextMenu={(e) => { e.preventDefault(); trackMenu(e.clientX, e.clientY, t.id) }}>
              <div className="tl-th-top">
                <button className="tl-fold" title={t.collapsed ? 'Expand track' : 'Collapse track'} data-open={!t.collapsed || undefined} onPointerUp={blurOnUp}
                  onClick={() => apply((p) => ops.setTrack(p, t.id, { collapsed: !t.collapsed }))}>
                  <svg width="8" height="8" viewBox="0 0 8 8"><path d="M2 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <TrackName track={t} />
              </div>
              <div className="ed-flags">
                <button className={`ed-flag mono ${t.target ? 'on target' : ''}`} title="Target track for inserts and ripple (Option-click: only this track)" onPointerUp={blurOnUp}
                  onClick={(e) => useEditor.getState().targetTrack(t.id, e.altKey)}>T</button>
                {flag(t, 'mute', 'M', 'Mute')}{flag(t, 'solo', 'S', 'Solo')}{flag(t, 'lock', 'L', 'Lock')}<TrackFxButton track={t} />
              </div>
              {!tight && <Gain track={t} />}
              <Grip track={t} />
            </div>
          )
        })}
        {Array.from({ length: ghost }, (_, i) => (
          <div key={'g' + i} className="ed-th-row tl-th-row ed-ghost mono" style={{ height: TL.laneH, '--stripe': trackColor(tracks.length + i) } as CSSProperties}>NEW TRACK</div>
        ))}
      </div>
      <button className="ed-th-foot" data-on={tidy || undefined} role="switch" aria-checked={tidy} onPointerUp={blurOnUp}
        title="When on, a track is deleted as soon as its last clip leaves it (Cmd+Z brings it back)" onClick={() => useEditor.getState().toggleAutoDelete()}>
        <span className="ed-sw"><i /></span>
        <span className="ed-foot-txt"><b>DELETE EMPTY TRACKS</b><small>{tidy ? 'ON: they vanish' : 'OFF: they stay'}</small></span>
      </button>
    </div>
  )
}

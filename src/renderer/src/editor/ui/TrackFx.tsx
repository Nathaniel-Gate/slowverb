import { useRef, useState } from 'react'
import { REVERB } from '../../config/fx'
import { TRACK_EQ, TRACK_REVERB } from '../../config/editorAudio'
import { Knob } from '../../features/fx/Knob'
import { useEditor } from '../editor.store'
import type { Track } from '../model'
import { trackFxActive } from '../trackFx'
import { Popover } from './Popover'
import './trackfx.css'

const db = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`

/** The FX button on a track header: lit when the track has EQ or reverb; opens the panel. */
export function TrackFxButton({ track }: { track: Track }) {
  const [open, setOpen] = useState(false), ref = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={ref} className={`ed-flag mono ${trackFxActive(track.fx) ? 'on fx' : ''}`} title="Track effects: EQ and reverb" onPointerUp={(e) => e.currentTarget.blur()} onClick={() => setOpen((o) => !o)}>FX</button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} className="tfx-pop"><TrackFxPanel track={track} /></Popover>
    </>
  )
}

/** Simple 3-band EQ + reverb for ONE track. Every slider drag is a single undo step (coalesced in the store). */
function TrackFxPanel({ track }: { track: Track }) {
  const set = useEditor.getState().setTrackFx, fx = track.fx, rv = fx?.reverb
  return (
    <div className="tfx" onDoubleClick={(e) => e.stopPropagation()}>
      <div className="row"><span className="mono">{track.name} · EFFECTS</span>
        <button className="ghost" disabled={!trackFxActive(fx)} onClick={() => useEditor.getState().resetTrackFx(track.id)}>RESET</button></div>
      <div className="mono tfx-h">EQ</div>
      <div className="tfx-knobs">
        <Knob label={`Low ${TRACK_EQ.lowHz} Hz`} value={fx?.low ?? 0} text={db(fx?.low ?? 0)} min={TRACK_EQ.minDb} max={TRACK_EQ.maxDb} step={0.5} onChange={(low) => set(track.id, { low })} />
        <Knob label="Mid 1 kHz" value={fx?.mid ?? 0} text={db(fx?.mid ?? 0)} min={TRACK_EQ.minDb} max={TRACK_EQ.maxDb} step={0.5} onChange={(mid) => set(track.id, { mid })} />
        <Knob label="High 6 kHz" value={fx?.high ?? 0} text={db(fx?.high ?? 0)} min={TRACK_EQ.minDb} max={TRACK_EQ.maxDb} step={0.5} onChange={(high) => set(track.id, { high })} />
      </div>
      <div className="mono tfx-h">REVERB</div>
      <div className="tfx-knobs">
        <Knob label="Mix" value={rv?.wet ?? 0} text={`${Math.round((rv?.wet ?? 0) * 100)}%`} min={0} max={1} step={0.01} onChange={(wet) => set(track.id, { reverb: wet > 0 ? { wet } : null })} />
        <Knob label="Length" value={rv?.decay ?? TRACK_REVERB.defaultDecay} text={`${(rv?.decay ?? TRACK_REVERB.defaultDecay).toFixed(1)}s`} min={TRACK_REVERB.decayMin} max={Math.min(TRACK_REVERB.decayMax, REVERB.decayMax)} step={0.1} onChange={(decay) => set(track.id, { reverb: { decay } })} />
        <Knob label="Darkness" value={rv?.damping ?? TRACK_REVERB.defaultDamping} text={`${Math.round((rv?.damping ?? TRACK_REVERB.defaultDamping) * 100)}%`} min={0} max={1} step={0.01} onChange={(damping) => set(track.id, { reverb: { damping } })} />
      </div>
    </div>
  )
}

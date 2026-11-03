import { PANELS } from '../../../config/panels'
import { detectBpm, tap } from '../../bpm'
import { useEditor } from '../../editor.store'
import { Field } from './Field'
import { usePanels } from './panels.store'
import { clamp, fmtTime, parseNum, parseTime } from './timecode'

export function Bpm() {
  const bpm = useEditor((s) => s.project?.bpm ?? null), offset = useEditor((s) => s.project?.bpmOffset ?? 0)
  const beatSnap = useEditor((s) => s.beatSnap), showBeats = useEditor((s) => s.showBeats)
  const { detecting, detected, taps } = usePanels()
  const ed = useEditor.getState(), pn = usePanels.getState()
  const setBpm = (v: number | null, off = offset) => useEditor.getState().setBpm(v === null ? null : clamp(v, PANELS.bpmMin, PANELS.bpmMax), off)

  const detect = async () => {
    const s = useEditor.getState(), p = s.project, buf = p && s.buffers.get(p.song); if (!p || !buf) return s.showToast('Song not loaded')
    pn.set({ detecting: true, detected: null })
    await new Promise((r) => setTimeout(r, 40))   // let "Detecting" paint before the analysis blocks the thread
    try { const r = detectBpm(buf); pn.set({ detected: { conf: r.confidence } }); setBpm(r.bpm, r.offset); s.showToast(`Detected ${r.bpm.toFixed(1)} BPM`) }
    catch (e) { console.error('[bpm] detect failed', e); s.showToast('Detection failed') }
    finally { usePanels.getState().set({ detecting: false }) }
  }
  const onTap = () => {
    const now = performance.now() / 1000, last = taps[taps.length - 1]
    const next = [...(last !== undefined && now - last < PANELS.tapResetSec ? taps : []), now].slice(-PANELS.tapKeep)
    pn.set({ taps: next }); const v = tap(next); if (v) setBpm(v)
  }
  const half = (f: number) => bpm && setBpm(bpm * f)

  return (
    <div className="dk-stack">
      <div className="dk-sec">
        <div className="row"><span className="mono">TEMPO</span>
          <Field value={bpm} fmt={(v) => String(+v.toFixed(2))} parse={parseNum} step={0.1} onCommit={(v) => setBpm(v)} /></div>
        <div className="dk-btns">
          <button className="chip" disabled={detecting} onClick={() => void detect()}>{detecting ? 'DETECTING' : 'DETECT'}</button>
          <button className="chip dk-tap" onPointerDown={onTap} title="Tap along with the beat">TAP</button>
          <button className="chip" disabled={!bpm} onClick={() => half(0.5)}>/2</button>
          <button className="chip" disabled={!bpm} onClick={() => half(2)}>x2</button>
          <button className="chip" disabled={!bpm} onClick={() => setBpm(null)}>CLEAR</button>
        </div>
        {detected && <p className="dk-note mono">{detected.conf < PANELS.bpmLowConfidence ? 'Low confidence: check by ear or tap it.' : `Confidence ${Math.round(detected.conf * 100)}%`}</p>}
        {!detected && taps.length > 1 && <p className="dk-note mono">{taps.length} taps</p>}
      </div>
      <div className="dk-sec">
        <div className="row"><span className="mono">FIRST BEAT</span>
          <Field value={offset} fmt={fmtTime} parse={parseTime} step={PANELS.offsetStep} disabled={!bpm} onCommit={(v) => setBpm(bpm, Math.max(0, v))} /></div>
        <div className="dk-btns">
          <button className="chip" disabled={!bpm} onClick={() => setBpm(bpm, Math.max(0, offset - PANELS.offsetStep))}>-10 ms</button>
          <button className="chip" disabled={!bpm} onClick={() => setBpm(bpm, offset + PANELS.offsetStep)}>+10 ms</button>
          <button className="chip" disabled={!bpm} onClick={() => setBpm(bpm, ed.now())} title="Make the playhead the first beat">SET TO PLAYHEAD</button>
        </div>
      </div>
      <div className="dk-sec">
        <div className="row"><span className="mono">SNAP TO BEATS</span>
          <button className={`ghost ${beatSnap ? 'on' : ''}`} disabled={!bpm} onClick={() => useEditor.setState({ beatSnap: !beatSnap })}>{beatSnap ? 'ON' : 'OFF'}</button></div>
        <div className="row"><span className="mono">SHOW BEAT GRID</span>
          <button className={`ghost ${showBeats ? 'on' : ''}`} disabled={!bpm} onClick={() => useEditor.setState({ showBeats: !showBeats })}>{showBeats ? 'ON' : 'OFF'}</button></div>
        {!bpm && <p className="dk-note mono">Set a tempo to use the grid.</p>}
      </div>
    </div>
  )
}

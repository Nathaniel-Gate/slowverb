import { PANELS } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import { type Clip, type FadeCurve } from '../../model'
import { fmtTime } from './timecode'

const common = <T,>(cs: Clip[], f: (c: Clip) => T): T | null => (cs.every((c) => f(c) === f(cs[0])) ? f(cs[0]) : null)

/** Fade curve pickers for the selected clips (linear / equal power / log / S). */
export function FadeCurves({ clips }: { clips: Clip[] }) {
  const row = (which: 'in' | 'out') => {
    const cur = common(clips, (c) => (which === 'in' ? c.fadeInCurve : c.fadeOutCurve) ?? 'pow')
    return (
      <div className="row" key={which}><span className="mono">{which === 'in' ? 'IN CURVE' : 'OUT CURVE'}</span>
        <div className="dk-curves">
          {PANELS.fadeCurves.map((c) => (
            <button key={c.id} className={`chip ${cur === c.id ? 'on' : ''}`} title={c.title} onClick={() => useEditor.getState().setFadeCurveSel(which, c.id as FadeCurve)}>{c.label}</button>
          ))}
        </div>
      </div>
    )
  }
  return <div className="dk-sec">{row('in')}{row('out')}</div>
}

/** Volume envelope (rubber band) status for the selection, with a clear button. */
export function EnvSection({ clips }: { clips: Clip[] }) {
  const n = clips.reduce((a, c) => a + (c.env?.length ?? 0), 0)
  return (
    <div className="dk-sec">
      <div className="row"><span className="mono">ENVELOPE</span>
        <button className="chip" disabled={!n} onClick={() => useEditor.getState().clearEnvSelected()} title="Remove the volume envelope from the selected clips">CLEAR</button></div>
      <p className="dk-note mono">{n ? `${n} point${n === 1 ? '' : 's'} on ${clips.filter((c) => c.env?.length).length} clip${clips.filter((c) => c.env?.length).length === 1 ? '' : 's'}` : 'Flat. Drag the line on a clip to shape the volume.'}</p>
    </div>
  )
}

/** Project-level: micro-fades on every clip boundary so cuts never click. */
export function SmoothCuts() {
  const on = useEditor((s) => (s.project ? s.project.smoothCuts !== false : false)), has = useEditor((s) => !!s.project)
  return (
    <div className="dk-sec">
      <div className="row"><span className="mono">SMOOTH CUTS</span>
        <button className={`ghost ${on ? 'on' : ''}`} disabled={!has} onClick={() => useEditor.getState().setSmoothCuts(!on)} title="A few ms of fade on every clip edge so cuts never click">{on ? 'ON' : 'OFF'}</button></div>
    </div>
  )
}

/** Range actions. Shows only while a range (or In/Out marks) exists. */
export function RangeSection() {
  const range = useEditor((s) => s.range), markIn = useEditor((s) => s.markIn), markOut = useEditor((s) => s.markOut)
  const r = range ?? (markIn !== null && markOut !== null && markOut > markIn ? { a: markIn, b: markOut, tracks: null } : null)
  if (!r) return null
  const ed = useEditor.getState(), db = PANELS.rangeGainDb
  return (
    <div className="dk-sec dk-pop">
      <div className="row"><span className="mono">{range ? 'RANGE' : 'IN / OUT'}</span>
        <span className="mono dk-dim">{fmtTime(r.a)} to {fmtTime(r.b)}</span></div>
      <div className="row"><span className="mono">LENGTH</span>
        <span className="mono dk-dim">{fmtTime(r.b - r.a)} / {r.tracks ? `${r.tracks.length} track${r.tracks.length === 1 ? '' : 's'}` : 'all tracks'}</span></div>
      <div className="dk-btns">
        <button className="chip" onClick={() => ed.muteRange()} title="Silence the range without cutting (M)">MUTE</button>
        <button className="chip" onClick={() => ed.gainRangeDb(-db)} title={`Lower the range by ${db} dB (Alt+Down)`}>GAIN -{db}</button>
        <button className="chip" onClick={() => ed.gainRangeDb(db)} title={`Raise the range by ${db} dB (Alt+Up)`}>GAIN +{db}</button>
        <button className="chip" onClick={() => ed.fadeRangeEdge('in')} title="Fade in from silence across the range (Alt+F)">FADE IN</button>
        <button className="chip" onClick={() => ed.fadeRangeEdge('out')} title="Fade out to silence across the range (Alt+Shift+F)">FADE OUT</button>
        <button className="chip" onClick={() => ed.liftRangeSel()} title="Remove the range and leave a gap">LIFT</button>
        <button className="chip" onClick={() => ed.extractRangeSel()} title="Remove the range and close the gap">EXTRACT</button>
      </div>
    </div>
  )
}

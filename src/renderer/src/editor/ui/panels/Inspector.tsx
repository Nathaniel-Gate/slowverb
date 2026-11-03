import { LABELS, PANELS } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import { analyseClip, gainToTarget } from '../../analysis'
import { clipDur, clipSpeed, type Clip } from '../../model'
import * as ops from '../../ops'
import { Field, TextField } from './Field'
import { EnvSection, FadeCurves, RangeSection, SmoothCuts } from './InspectorExtras'
import { usePanels } from './panels.store'
import { clamp, dbOf, fmtTime, gainOf, parseNum, parseTime } from './timecode'

/** Value shared by every selected clip, or null when they disagree. */
const common = <T,>(cs: Clip[], f: (c: Clip) => T): T | null => (cs.every((c) => f(c) === f(cs[0])) ? f(cs[0]) : null)

export function Inspector() {
  const project = useEditor((s) => s.project), sel = useEditor((s) => s.selection), buffers = useEditor((s) => s.buffers)
  const norm = usePanels((s) => s.norm), mode = usePanels((s) => s.normMode)
  const ed = useEditor.getState()
  const clips = project ? project.clips.filter((c) => sel.includes(c.id)) : []
  if (!clips.length) return <div className="dk-stack"><RangeSection /><p className="dk-empty mono">Select a clip to inspect it</p><SmoothCuts /></div>
  const one = clips.length === 1 ? clips[0] : null, ids = clips.map((c) => c.id)
  const gain = common(clips, (c) => c.gain), speedPct = common(clips, (c) => Math.round(clipSpeed(c) * 1000) / 10)
  const fadeIn = common(clips, (c) => c.fadeIn), fadeOut = common(clips, (c) => c.fadeOut)
  const allOff = clips.every((c) => c.disabled), label = common(clips, (c) => c.label ?? '')
  const patch = (p: Parameters<typeof ed.patchSelected>[0]) => useEditor.getState().patchSelected(p)

  const normalise = () => {
    const results = clips.map((c) => { const b = buffers.get(c.src); if (!b) return null; const a = analyseClip(b, c.srcIn, c.srcOut); return { id: c.id, a, g: gainToTarget(a, PANELS.normTargetDb, mode) } })
    const ok = results.filter((r): r is NonNullable<typeof r> => !!r); if (!ok.length) return
    useEditor.getState().apply((p) => ok.reduce((q, r) => ops.patchClips(q, [r.id], { gain: r.g }), p))
    usePanels.getState().set({ norm: ok[0].a }); useEditor.getState().showToast(`Normalised to ${PANELS.normTargetDb} dB ${mode}`)
  }
  const speed = clipSpeed(one ?? clips[0])
  const gdb = gain === null ? 0 : clamp(dbOf(gain), PANELS.gainMinDb, PANELS.gainMaxDb)
  return (
    <div className="dk-stack">
      <RangeSection />
      <div className="dk-sec">
        <span className="mono">{one ? 'CLIP' : `${clips.length} CLIPS`}</span>
        <TextField value={common(clips, (c) => c.name ?? '')} placeholder="Name" onCommit={(name) => patch({ name })} />
        <div className="dk-swatches">
          <button className={`dk-sw none ${label === '' ? 'on' : ''}`} title="No label" onClick={() => patch({ label: undefined })} />
          {LABELS.map((l) => <button key={l.key} className={`dk-sw ${label === l.key ? 'on' : ''}`} title={l.key} style={{ '--c': l.css } as React.CSSProperties} onClick={() => patch({ label: l.key })} />)}
        </div>
      </div>

      <div className="dk-sec">
        <div className="row"><span className="mono">GAIN dB</span>
          <Field value={gain === null ? null : dbOf(gain)} fmt={(d) => (d === -Infinity ? '-inf' : (d > 0 ? '+' : '') + d.toFixed(1))} parse={(s) => (/^-?inf/i.test(s.trim()) ? PANELS.gainMinDb : parseNum(s))}
            step={0.5} onCommit={(d) => patch({ gain: d <= PANELS.gainMinDb ? 0 : gainOf(clamp(d, PANELS.gainMinDb, PANELS.gainMaxDb)) })} /></div>
        <input type="range" min={PANELS.gainMinDb} max={PANELS.gainMaxDb} step={PANELS.gainStepDb} title="Double-click for 0 dB" aria-label="Gain"
          value={gdb} style={{ '--p': `${((gdb - PANELS.gainMinDb) / (PANELS.gainMaxDb - PANELS.gainMinDb)) * 100}%` } as React.CSSProperties}
          onChange={(e) => patch({ gain: +e.target.value <= PANELS.gainMinDb ? 0 : gainOf(+e.target.value) })} onDoubleClick={() => patch({ gain: 1 })} />
        <div className="dk-btns">
          <button className="chip" onClick={normalise} title="Set gain so the clip hits the target level">NORMALISE {PANELS.normTargetDb} dB</button>
          <button className={`chip ${mode === 'peak' ? 'on' : ''}`} onClick={() => usePanels.getState().set({ normMode: 'peak' })}>PEAK</button>
          <button className={`chip ${mode === 'rms' ? 'on' : ''}`} onClick={() => usePanels.getState().set({ normMode: 'rms' })}>RMS</button>
        </div>
        {norm && <p className="dk-note mono">last read: peak {norm.peakDb.toFixed(1)} / rms {norm.rmsDb.toFixed(1)} / ~{norm.lufsApprox.toFixed(1)} LUFS</p>}
      </div>

      <div className="dk-sec">
        <div className="row"><span className="mono">SPEED %</span>
          <Field value={speedPct} fmt={(v) => String(+v.toFixed(1))} parse={parseNum} step={1} onCommit={(v) => patch({ speed: clamp(v, PANELS.speedMinPct, PANELS.speedMaxPct) / 100 })} /></div>
        <div className="dk-btns">{PANELS.speedChips.map((v) => <button key={v} className={`chip ${speedPct === v ? 'on' : ''}`} onClick={() => patch({ speed: v / 100 })}>{v}</button>)}</div>
      </div>

      <div className="dk-sec dk-grid2">
        <Field label="FADE IN s" value={fadeIn} fmt={(v) => v.toFixed(2)} parse={parseNum} step={PANELS.fadeStep} onCommit={(v) => patch({ fadeIn: clamp(v, 0, PANELS.fadeMaxSec) })} />
        <Field label="FADE OUT s" value={fadeOut} fmt={(v) => v.toFixed(2)} parse={parseNum} step={PANELS.fadeStep} onCommit={(v) => patch({ fadeOut: clamp(v, 0, PANELS.fadeMaxSec) })} />
      </div>

      <FadeCurves clips={clips} />
      <EnvSection clips={clips} />

      <div className="dk-sec dk-grid2">
        <Field label="START" disabled={!one} value={one ? one.start : null} fmt={fmtTime} parse={parseTime} step={PANELS.timeStep}
          onCommit={(t) => one && ed.apply((p) => ops.moveClips(p, [one.id], Math.max(0, t) - one.start))} />
        <Field label="LENGTH" disabled value={one ? clipDur(one) : null} fmt={fmtTime} parse={parseTime} />
        <Field label="SOURCE IN" disabled={!one} value={one ? one.srcIn : null} fmt={fmtTime} parse={parseTime} step={PANELS.timeStep}
          onCommit={(v) => one && ed.apply((p) => ops.trimClip(p, one.id, 'in', one.start + (v - one.srcIn) / speed))} />
        <Field label="SOURCE OUT" disabled={!one} value={one ? one.srcOut : null} fmt={fmtTime} parse={parseTime} step={PANELS.timeStep}
          onCommit={(v) => one && ed.apply((p) => ops.trimClip(p, one.id, 'out', one.start + (v - one.srcIn) / speed))} />
      </div>

      <SmoothCuts />

      <div className="dk-btns dk-end">
        <button className={`chip ${allOff ? 'on' : ''}`} onClick={() => patch({ disabled: !allOff })} title="Silence the clip without deleting it">{allOff ? 'DISABLED' : 'DISABLE'}</button>
        <button className="chip" onClick={() => useEditor.getState().crossfadeSelection()} title="Crossfade across the cut between two adjacent clips (Cmd+D)">CROSSFADE</button>
      </div>
      {ids.length > 1 && <p className="dk-note mono">Start and source times need a single clip.</p>}
    </div>
  )
}

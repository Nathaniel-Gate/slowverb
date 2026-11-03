import { useEffect, useRef } from 'react'
import { EDITOR } from '../../../config/editorKeys'
import { PANELS } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import type { Loop } from '../../model'
import { loopOfSelection } from '../../storeLoop'
import type { LoopPatch } from '../../storeTypes'
import { Field } from './Field'
import { LoopWave } from './LoopWave'
import { clamp, dbOf, fmtTime, gainOf, parseNum, parseTime } from './timecode'

const L = EDITOR.loop
const r6 = (v: number) => Math.round(v * 1e6) / 1e6   // microsecond-safe: 1.2345 + 0.001 stays 1.2355

/** - / + button. Click = one unit, Shift-click = ten, hold = repeats (after a short delay). `onStep` gets a signed count of units. */
function StepBtn({ dir, onStep }: { dir: -1 | 1; onStep(units: number): void }) {
  const cb = useRef(onStep); cb.current = onStep
  const t = useRef<{ d?: number; i?: number; stop?: () => void }>({})
  useEffect(() => () => t.current.stop?.(), [])
  const down = (e: React.PointerEvent) => {
    if (e.button !== 0) return; e.preventDefault(); t.current.stop?.()
    let shift = e.shiftKey; const key = (k: KeyboardEvent) => { shift = k.shiftKey }
    const fire = () => cb.current(dir * (shift ? L.stepBigMs / L.stepMs : 1))
    const stop = () => { clearTimeout(t.current.d); clearInterval(t.current.i); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop); window.removeEventListener('keydown', key); window.removeEventListener('keyup', key); t.current.stop = undefined }
    t.current.stop = stop; window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop); window.addEventListener('keydown', key); window.addEventListener('keyup', key)
    fire(); t.current.d = window.setTimeout(() => { t.current.i = window.setInterval(fire, L.holdEveryMs) }, L.holdDelayMs)
  }
  return <button type="button" className="dk-stepbtn" aria-label={dir < 0 ? 'Decrease' : 'Increase'} title="Click = 1 unit, Shift = 10, hold to repeat"
    onPointerDown={down} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onStep(dir * (e.shiftKey ? L.stepBigMs / L.stepMs : 1)) } }}>{dir < 0 ? '−' : '+'}</button>
}

/** Number box with steppers either side. */
function NumStep(p: { label: string; value: number | null; fmt(v: number): string; parse(s: string): number | null; step: number; onCommit(v: number): void; onStep(units: number): void; disabled?: boolean; title?: string }) {
  return (
    <div className="dk-lf"><span className="mono">{p.label}</span>
      <div className={`dk-step ${p.disabled ? 'off' : ''}`} title={p.title}>
        {p.disabled ? <i /> : <StepBtn dir={-1} onStep={p.onStep} />}
        <Field value={p.value} fmt={p.fmt} parse={p.parse} step={p.step} onCommit={p.onCommit} disabled={p.disabled} />
        {p.disabled ? <i /> : <StepBtn dir={1} onStep={p.onStep} />}
      </div>
    </div>
  )
}

const fmtMs = (ms: number) => String(+ms.toFixed(1)), fmtDb = (d: number) => (d === -Infinity ? '-inf' : (d > 0 ? '+' : '') + d.toFixed(1))

function LoopEditor({ loop }: { loop: Loop }) {
  const peaks = useEditor((s) => s.peaks.get(loop.src)), buf = useEditor((s) => s.buffers.get(loop.src)), dur = useEditor((s) => s.project?.sources[loop.src]?.duration ?? buf?.duration ?? 0)
  const cur = () => useEditor.getState().project?.loops?.find((l) => l.id === loop.id) ?? loop
  const set = (field: string, patch: LoopPatch) => useEditor.getState().updateLoopLive(loop.id, patch, `loopfield:${loop.id}:${field}`)
  const len = loop.srcOut - loop.srcIn, span = loop.count * (len - loop.xfade) + loop.xfade
  const ed = useEditor.getState()
  return (
    <div className="dk-sec dk-loop">
      <div className="row"><span className="mono">LOOP</span><span className="mono dk-dim">x{loop.count} / crossfade {fmtMs(loop.xfade * 1000)} ms</span></div>
      <div className="dk-grid2">
        <NumStep label="START" value={loop.srcIn} fmt={fmtTime} parse={parseTime} step={0.001} title="Where each repeat begins in the source (m:ss.mmm). Up/Down = 1 ms, Shift 10 ms"
          onCommit={(v) => set('srcIn', { srcIn: v })} onStep={(u) => set('srcIn', { srcIn: r6(cur().srcIn + u * 0.001) })} />
        <NumStep label="END" value={loop.srcOut} fmt={fmtTime} parse={parseTime} step={0.001} title="Where each repeat ends in the source (m:ss.mmm)"
          onCommit={(v) => set('srcOut', { srcOut: v })} onStep={(u) => set('srcOut', { srcOut: r6(cur().srcOut + u * 0.001) })} />
        <NumStep label="LENGTH" disabled value={len} fmt={fmtTime} parse={parseTime} step={0.001} onCommit={() => {}} onStep={() => {}} title="END minus START (read only)" />
        <NumStep label="CROSSFADE ms" value={loop.xfade * 1000} fmt={fmtMs} parse={parseNum} step={1} title="Overlap between repeats, equal power"
          onCommit={(v) => set('xfade', { xfade: Math.max(0, v) / 1000 })} onStep={(u) => set('xfade', { xfade: Math.max(0, r6(cur().xfade + u * 0.001)) })} />
        <NumStep label="REPEATS" value={loop.count} fmt={(v) => String(Math.round(v))} parse={parseNum} step={1} title="How many times the slice plays"
          onCommit={(v) => set('count', { count: clamp(Math.round(v), 1, L.maxCount) })} onStep={(u) => set('count', { count: clamp(cur().count + u, 1, L.maxCount) })} />
        <NumStep label="LEVEL dB" value={dbOf(loop.gain)} fmt={fmtDb} parse={(s) => (/^-?inf/i.test(s.trim()) ? PANELS.gainMinDb : parseNum(s))} step={0.1} title="Gain of every repeat. Step 0.1 dB, Shift 1 dB"
          onCommit={(v) => set('gain', { gain: v <= PANELS.gainMinDb ? 0 : gainOf(clamp(v, PANELS.gainMinDb, PANELS.gainMaxDb)) })}
          onStep={(u) => set('gain', { gain: gainOf(clamp(Math.max(dbOf(cur().gain), PANELS.gainMinDb) + u * 0.1, PANELS.gainMinDb, PANELS.gainMaxDb)) })} />
      </div>
      {peaks && dur > 0 ? <LoopWave loop={loop} peaks={peaks} buf={buf} duration={dur} /> : <p className="dk-note mono">Loading the source waveform...</p>}
      <p className="dk-note mono">Plays {fmtTime(span)} on the timeline from {fmtTime(loop.start)}.</p>
      <div className="dk-btns">
        <button className="chip" onClick={() => ed.loopFillToPlayhead()} title="Add repeats until the loop reaches the playhead">LOOP TO PLAYHEAD</button>
        <button className="chip" onClick={() => ed.detachLastRepeat()} title="Make the last repeat a normal clip so you can trim or extend it (⌥⇧D)">DETACH LAST</button>
        <button className="chip" onClick={() => ed.unloopSelection()} title="Keep the repeats as plain clips (⌥⇧L)">UNLOOP</button>
      </div>
    </div>
  )
}

/** LOOP section of the Inspector: the editor for a selected loop, or MAKE LOOP for a single plain clip. */
export function InspectorLoop() {
  const loop = useEditor((s) => loopOfSelection(s.project, s.selection))
  const plain = useEditor((s) => (!s.project || s.selection.length !== 1 ? null : s.project.clips.find((c) => c.id === s.selection[0] && !c.loop)?.id ?? null))
  if (loop) return <LoopEditor loop={loop} />
  if (!plain) return null
  return (
    <div className="dk-sec dk-pop">
      <div className="row"><span className="mono">LOOP</span>
        <button className="chip" onClick={() => useEditor.getState().makeLoopFromSelection()} title="Repeat this clip with an equal-power crossfade (⌥L)">MAKE LOOP</button></div>
      <p className="dk-note mono">Repeats the clip x{L.defaultCount} on this track. Then nudge the start and end points to the millisecond and set the crossfade.</p>
    </div>
  )
}

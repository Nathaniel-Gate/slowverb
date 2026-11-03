import { PANELS } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import * as ops from '../../ops'
import { detectSections, detectSilence } from '../../sections'
import { Field } from './Field'
import { usePanels } from './panels.store'
import { clamp, fmtTime, parseNum } from './timecode'

const paint = () => new Promise((r) => setTimeout(r, 40))   // let the busy label paint before analysis blocks the thread

/** AUTO tab: one-click helpers (find sections, trim silence, cut on the beat, scan for silences). */
export function Auto() {
  const song = useEditor((s) => s.project?.song ?? null), bpm = useEditor((s) => s.project?.bpm ?? null)
  const { auto, autoBusy, sens, silDb, silMin } = usePanels()
  const here = auto && auto.song === song ? auto : null, sections = here?.sections ?? null, silences = here?.silences ?? null
  const ed = useEditor.getState(), pn = usePanels.getState()
  const buffer = () => { const s = useEditor.getState(), buf = s.project && s.buffers.get(s.project.song); if (!buf) s.showToast('Song not loaded'); return buf ?? null }
  const keep = (patch: Partial<NonNullable<typeof here>>) => { const cur = usePanels.getState().auto; usePanels.getState().set({ auto: { sections: null, silences: null, ...(cur && cur.song === song ? cur : {}), song: song ?? '', ...patch } }) }

  const findSections = async () => {
    const buf = buffer(); if (!buf) return
    pn.set({ autoBusy: 'sections' }); await paint()
    try {
      const r = detectSections(buf, { minSec: PANELS.sectionMinSec, sensitivity: PANELS.sectionSens[sens]?.v }).sort((a, b) => a.t - b.t)
      keep({ sections: r }); useEditor.getState().showToast(r.length ? `Found ${r.length} section${r.length === 1 ? '' : 's'}` : 'No sections found')
    } catch (e) { console.error('[auto] sections failed', e); useEditor.getState().showToast('Detection failed') }
    finally { usePanels.getState().set({ autoBusy: null }) }
  }
  const scanSilence = async () => {
    const buf = buffer(); if (!buf) return
    pn.set({ autoBusy: 'silence' }); await paint()
    try {
      const r = detectSilence(buf, silDb, silMin); keep({ silences: r })
      useEditor.getState().showToast(r.length ? `Found ${r.length} silence${r.length === 1 ? '' : 's'}` : 'No silences found')
    } catch (e) { console.error('[auto] silence failed', e); useEditor.getState().showToast('Scan failed') }
    finally { usePanels.getState().set({ autoBusy: null }) }
  }
  const markers = () => {
    if (!sections?.length) return
    const ts = sections.map((x) => x.t)
    ed.apply((p) => ts.reduce((q, t, i) => ops.addMarker(q, t, `Section ${i + 1}`), p)); ed.showToast(`Added ${ts.length} marker${ts.length === 1 ? '' : 's'}`)
  }
  const cutAt = () => { if (!sections?.length) return; const ts = sections.map((x) => x.t); ed.apply((p) => ops.splitAtMany(p, ts)); ed.showToast(`Cut at ${ts.length} section${ts.length === 1 ? '' : 's'}`) }
  const muteAll = () => { if (!silences?.length) return; const l = silences; ed.apply((p) => l.reduce((q, x) => ops.muteRange(q, x.start, x.end), p)); ed.showToast(`Muted ${l.length} silence${l.length === 1 ? '' : 's'}`) }
  const max = Math.max(1e-9, ...(sections ?? []).map((x) => x.strength))

  return (
    <div className="dk-stack">
      <div className="dk-sec">
        <div className="row"><span className="mono">SECTIONS</span>
          <div className="dk-curves">{PANELS.sectionSens.map((s, i) => <button key={s.label} className={`chip ${sens === i ? 'on' : ''}`} title="How easily a change counts as a new section" onClick={() => pn.set({ sens: i })}>{s.label}</button>)}</div></div>
        <div className="dk-btns">
          <button className="chip" disabled={!song || !!autoBusy} onClick={() => void findSections()}>{autoBusy === 'sections' ? 'DETECTING' : 'DETECT SECTIONS'}</button>
          <button className="chip" disabled={!sections?.length} onClick={markers} title="Drop a marker at every section">ADD AS MARKERS</button>
          <button className="chip" disabled={!sections?.length} onClick={cutAt} title="Split every clip at every section">CUT AT SECTIONS</button>
        </div>
        {sections && (
          <div className="dk-list dk-auto-list">
            {sections.slice(0, PANELS.autoListMax).map((x, i) => (
              <div key={x.t} className="dk-auto-row" style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}>
                <button className="mono dk-time" title="Jump to section" onClick={() => ed.gotoTime(x.t)}>{fmtTime(x.t)}</button>
                <div className="dk-bar" title={`Strength ${Math.round(x.strength * 100)}%`}><i style={{ '--v': clamp(x.strength / max, 0, 1) } as React.CSSProperties} /></div>
              </div>
            ))}
            {!sections.length && <p className="dk-empty mono">No clear changes. Try a higher sensitivity.</p>}
          </div>
        )}
        <p className="dk-note mono">Reads the original song, so times match an uncut timeline.</p>
      </div>

      <div className="dk-sec">
        <span className="mono">TRIM SILENCE</span>
        <div className="dk-btns"><button className="chip" onClick={() => ed.trimSilenceSelected()} title="Trim silence off the start and end of the selected clips">TRIM START AND END</button></div>
        <p className="dk-note mono">Acts on the selected clips.</p>
      </div>

      <div className="dk-sec">
        <span className="mono">CUT EVERY</span>
        <div className="dk-btns">{PANELS.cutEvery.map((c) => <button key={c.beats} className="chip" disabled={!bpm} onClick={() => ed.cutEveryBeatsAction(c.beats)} title={`Split on the beat grid every ${c.beats} beat${c.beats === 1 ? '' : 's'}`}>{c.label}</button>)}</div>
        {!bpm && <p className="dk-note mono">Set a tempo in the BPM tab first.</p>}
      </div>

      <div className="dk-sec">
        <span className="mono">FIND SILENCES</span>
        <div className="dk-grid2">
          <Field label="BELOW dB" value={silDb} fmt={(v) => String(v)} parse={parseNum} step={1} onCommit={(v) => pn.set({ silDb: clamp(v, PANELS.silenceDbMin, PANELS.silenceDbMax) })} />
          <Field label="LONGER THAN s" value={silMin} fmt={(v) => v.toFixed(2)} parse={parseNum} step={0.1} onCommit={(v) => pn.set({ silMin: clamp(v, 0.05, PANELS.silenceMinSecMax) })} />
        </div>
        <div className="dk-btns">
          <button className="chip" disabled={!song || !!autoBusy} onClick={() => void scanSilence()}>{autoBusy === 'silence' ? 'SCANNING' : 'SCAN'}</button>
          <button className="chip" disabled={!silences?.length} onClick={muteAll} title="Mute every silence found (non-destructive)">MUTE ALL</button>
        </div>
        {silences && (
          <div className="dk-list dk-auto-list">
            {silences.slice(0, PANELS.autoListMax).map((x, i) => (
              <div key={x.start} className="dk-auto-row dk-sil" style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}>
                <button className="mono dk-time" title="Jump to silence" onClick={() => ed.gotoTime(x.start)}>{fmtTime(x.start)}</button>
                <span />
                <span className="mono dk-dim">{(x.end - x.start).toFixed(2)} s</span>
              </div>
            ))}
            {!silences.length && <p className="dk-empty mono">No silences at this level.</p>}
          </div>
        )}
      </div>
    </div>
  )
}

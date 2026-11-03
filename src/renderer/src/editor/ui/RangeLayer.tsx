import type { PointerEvent as RPointerEvent } from 'react'
import { TL } from '../../config/timeline'
import { useEditor } from '../editor.store'
import { splitAt } from '../ops'
import type { Project } from '../model'
import { useRangeLive } from './rangeLive'
import type { Layout } from './timelineMath'

// The Range tool's selection: a soft overlay over the chosen lanes, a draggable handle on each side, and a floating mini toolbar.
type Props = { project: Project; layout: Layout; pps: number; scrollX: number; viewW: number; dragging: boolean; onEdge: (e: RPointerEvent, side: 'a' | 'b') => void }
const st = () => useEditor.getState()

/** Split at both range edges so the range becomes its own clips (on the range's tracks). */
function cutOut(a: number, b: number, tracks: string[] | null) {
  const s = st()
  s.apply(p => {
    const targeted = p.tracks.filter(t => t.target).map(t => t.id), on = tracks ?? (targeted.length ? targeted : null)
    const ids = on ? p.clips.filter(c => on.includes(c.track)).map(c => c.id) : undefined
    return splitAt(splitAt(p, a, ids), b, ids)
  })
  s.showToast(`Cut out ${(b - a).toFixed(2)}s`)
}

const BUTTONS: { label: string; tip: string; run: (r: { a: number; b: number; tracks: string[] | null }) => void }[] = [
  { label: 'Mute', tip: 'Silence the range (⌥M)', run: () => st().muteRange() },
  { label: 'Fade in', tip: 'Fade the range in from silence (⌥F)', run: () => st().fadeRangeEdge('in') },
  { label: 'Fade out', tip: 'Fade the range out to silence (⌥⇧F)', run: () => st().fadeRangeEdge('out') },
  { label: 'Gain -', tip: 'Range down 1 dB (⌥↓)', run: () => st().gainRangeDb(-TL.rangeGainStepDb) },
  { label: 'Gain +', tip: 'Range up 1 dB (⌥↑)', run: () => st().gainRangeDb(TL.rangeGainStepDb) },
  { label: 'Lift', tip: 'Remove the range, leave a gap (Delete)', run: () => st().liftRangeSel() },
  { label: 'Extract', tip: 'Remove the range and close the gap (⇧⌫)', run: () => st().extractRangeSel() },
  { label: 'Cut out', tip: 'Split at both edges so the range is its own clips', run: r => cutOut(r.a, r.b, r.tracks) }
]

export function RangeLayer({ project, layout: L, pps, scrollX, viewW, dragging, onEdge }: Props) {
  const stored = useEditor(s => s.range), draft = useRangeLive(s => s.draft)
  const r = draft ?? stored
  if (!r || r.b <= r.a) return null
  const x0 = r.a * pps - scrollX, x1 = r.b * pps - scrollX
  if (x1 < -TL.rangeHandlePx || x0 > viewW + TL.rangeHandlePx) return null
  const targeted = project.tracks.filter(t => t.target).map(t => t.id), on = r.tracks ?? (targeted.length ? targeted : null)
  // contiguous runs of selected lanes, each one rectangle
  const runs: { top: number; h: number }[] = []
  project.tracks.forEach((t, i) => {
    if (on && !on.includes(t.id)) return
    const last = runs[runs.length - 1]
    if (last && Math.abs(last.top + last.h - L.tops[i]) < 0.5) last.h += L.hs[i]; else runs.push({ top: L.tops[i], h: L.hs[i] })
  })
  if (!runs.length) return null
  const first = runs[0], mid = Math.min(Math.max((Math.max(x0, 0) + Math.min(x1, viewW)) / 2, TL.rangeBarW / 2 + 6), Math.max(TL.rangeBarW / 2 + 6, viewW - TL.rangeBarW / 2 - 6))
  const last = runs[runs.length - 1], above = first.top - TL.rangeBarH - TL.rangeBarGap
  // above the range when there is room, else just below a short range, else tucked inside its top edge
  const barTop = above >= 2 ? above : last.top + last.h - first.top < TL.rangeBarBelowMaxH ? last.top + last.h + TL.rangeBarGap : first.top + TL.rangeBarGap
  return (
    <>
      {runs.map((k, i) => (
        <div key={i} className="tl-rsel" data-live={draft ? '' : undefined} style={{ transform: `translate(${x0}px, ${k.top}px)`, width: x1 - x0, height: k.h }}>
          <i className="tl-rsel-h" data-side="a" onPointerDown={e => onEdge(e, 'a')} />
          <i className="tl-rsel-h" data-side="b" onPointerDown={e => onEdge(e, 'b')} />
        </div>
      ))}
      {!dragging && !draft && (
        <div className="tl-rbar mono" style={{ transform: `translate(${mid}px, ${barTop}px) translateX(-50%)`, height: TL.rangeBarH }}
          onPointerDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()} onContextMenu={e => { e.preventDefault(); e.stopPropagation() }}>
          {BUTTONS.map(b => <button key={b.label} title={b.tip} onClick={() => b.run(r)}>{b.label}</button>)}
          <span className="tl-rbar-len">{(r.b - r.a).toFixed(2)}s</span>
        </div>
      )}
    </>
  )
}

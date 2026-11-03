import { useMemo, useRef } from 'react'
import { create } from 'zustand'
import { TL, FADE_CURVES } from '../../config/timeline'
import type { FadeCurve } from '../model'
import { useEditor } from '../editor.store'
import { fadeGain } from '../schedule'
import { Popover } from './Popover'

// Resolve-style fade handles for one clip: an always-visible dot on each top corner (drag it, click it for the curve menu)
// and a drag zone down the upper part of each clip side (drag inward from the side to fade right away).
// Pointer handling lives in useTimelineInput; these are only the elements it finds through [data-fade].
type Pop = { clipId: string; edge: 'in' | 'out'; el: HTMLElement } | null
const usePop = create<{ pop: Pop }>(() => ({ pop: null }))
export const openFadePopover = (clipId: string, edge: 'in' | 'out', el: HTMLElement) => usePop.setState({ pop: { clipId, edge, el } })
export const closeFadePopover = () => usePop.setState({ pop: null })

type Props = { w: number; fadeIn: number; fadeOut: number; side: boolean }
export function FadeHandles({ w, fadeIn, fadeOut, side }: Props) {
  const lim = Math.max(TL.fadeDotInset, w - TL.fadeDotInset)
  const dot = (edge: 'in' | 'out', len: number) => {
    const x = Math.min(lim, Math.max(TL.fadeDotInset, len))
    return <i className="tl-fade" data-fade={edge} data-dot="" data-on={len > 0.5 || undefined} style={{ transform: `translateX(${edge === 'in' ? x : -x}px)` }} />
  }
  return (
    <>
      {side && <i className="tl-fadeside" data-fade="in" data-side="" />}
      {side && <i className="tl-fadeside" data-fade="out" data-side="" />}
      {dot('in', fadeIn)}
      {dot('out', fadeOut)}
    </>
  )
}

const GLYPH = 26
/** Small curve drawing for the popover rows (a fade in; fade out is the mirror). */
function Glyph({ curve, edge }: { curve: FadeCurve; edge: 'in' | 'out' }) {
  const d = useMemo(() => {
    const pts = Array.from({ length: 21 }, (_, j) => { const u = j / 20; return `${(u * GLYPH).toFixed(1)},${((1 - fadeGain(edge, u, curve)) * (GLYPH - 4) + 2).toFixed(1)}` })
    return `M${pts.join('L')}`
  }, [curve, edge])
  return <svg width={GLYPH} height={GLYPH} viewBox={`0 0 ${GLYPH} ${GLYPH}`}><path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
}

/** Curve menu opened by clicking a fade dot. Calls setFadeCurveSel (the clicked clip is already selected). */
export function FadeCurvePopover() {
  const pop = usePop(s => s.pop)
  const anchor = useRef<HTMLElement | null>(null)
  anchor.current = pop?.el ?? null
  const clip = useEditor(s => (pop ? s.project?.clips.find(c => c.id === pop.clipId) : undefined))
  if (!pop || !clip) return null
  const cur: FadeCurve = (pop.edge === 'in' ? clip.fadeInCurve : clip.fadeOutCurve) ?? 'pow'
  return (
    <Popover anchor={anchor} open onClose={closeFadePopover} className="tl-curvepop">
      <div className="tl-curvepop-h mono">FADE {pop.edge === 'in' ? 'IN' : 'OUT'} CURVE</div>
      {FADE_CURVES.map(c => (
        <button key={c.id} role="menuitem" className="tl-curvepop-row" data-on={c.id === cur || undefined}
          onClick={() => { useEditor.getState().setFadeCurveSel(pop.edge, c.id); closeFadePopover() }}>
          <Glyph curve={c.id} edge={pop.edge} /><span>{c.label}</span>
        </button>
      ))}
    </Popover>
  )
}

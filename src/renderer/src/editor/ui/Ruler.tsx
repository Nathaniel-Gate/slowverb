import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import type { Marker } from '../model'
import { TL, labelColor } from '../../config/timeline'
import { useEditor } from '../editor.store'
import { cachedVars, formatTick, pickStep } from './timelineMath'

export type RangePart = 'in' | 'out' | 'body'
type Props = {
  width: number; pxPerSec: number; scrollX: number
  markers: Marker[]; markIn: number | null; markOut: number | null; loop: boolean
  onDown: (e: RPointerEvent) => void
  onMarker: (m: Marker, e: RPointerEvent) => void
  onRange: (part: RangePart, e: RPointerEvent) => void
  onContext: (e: React.MouseEvent) => void
}
const VARS = ['--tl-tick', '--tl-tick-minor', '--tl-label', '--tl-ruler-line']

function Ruler({ width, pxPerSec, scrollX, markers, markIn, markOut, loop, onDown, onMarker, onRange, onContext }: Props) {
  const cv = useRef<HTMLCanvasElement>(null)
  const [renaming, setRenaming] = useState<string | null>(null)

  useEffect(() => {
    const c = cv.current
    if (!c || width <= 0) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(width * dpr); c.height = Math.round(TL.rulerH * dpr)
    const g = c.getContext('2d')!
    const col = cachedVars(c, VARS)
    g.scale(dpr, dpr)
    g.font = '10px "IBM Plex Mono", ui-monospace, monospace'; g.textBaseline = 'top'
    const { step, sub } = pickStep(pxPerSec)
    const k0 = Math.floor(scrollX / pxPerSec / step), k1 = Math.ceil((scrollX + width) / pxPerSec / step)
    const line = (x: number, h: number, color: string) => { g.fillStyle = color; g.fillRect(Math.round(x), TL.rulerH - h, 1, h) }
    for (let k = k0; k <= k1; k++) {
      const t = k * step, x = t * pxPerSec - scrollX
      for (let j = 1; j < sub; j++) line(x + (step * j / sub) * pxPerSec, 5, col['--tl-tick-minor'])
      line(x, 11, col['--tl-tick'])
      g.fillStyle = col['--tl-label']
      g.fillText(formatTick(t, step), Math.round(x) + 5, 5)
    }
    g.fillStyle = col['--tl-ruler-line']; g.fillRect(0, TL.rulerH - 1, width, 1)
  }, [width, pxPerSec, scrollX])

  const x = (t: number) => t * pxPerSec - scrollX
  const range = markIn !== null && markOut !== null && markOut > markIn
  const done = (m: Marker, v: string) => { setRenaming(null); if (v.trim() !== m.name) useEditor.getState().renameMarker(m.id, v.trim()) }
  const grips = (part: RangePart) => (e: RPointerEvent) => { e.stopPropagation(); onRange(part, e) }
  return (
    <div className="tl-ruler" onPointerDown={onDown} onContextMenu={onContext}>
      <canvas ref={cv} style={{ width, height: TL.rulerH }} />
      {range && (
        <div className="tl-ruler-range" data-loop={loop || undefined} style={{ transform: `translateX(${x(markIn!)}px)`, width: (markOut! - markIn!) * pxPerSec }}
          onPointerDown={grips('body')} title={loop ? 'Loop region (drag to move)' : 'In to Out (drag to move)'} />
      )}
      {markIn !== null && <div className="tl-bracket in" style={{ transform: `translateX(${x(markIn)}px)` }} onPointerDown={grips('in')} title="In point (drag)" />}
      {markOut !== null && <div className="tl-bracket out" style={{ transform: `translateX(${x(markOut)}px)` }} onPointerDown={grips('out')} title="Out point (drag)" />}
      {markers.map(m => {
        const mx = x(m.t)
        if (mx < -90 || mx > width + 4) return null
        const c = labelColor(m.color)
        return (
          <div key={m.id} className="tl-marker" data-hue={c ? '' : undefined} style={{ transform: `translateX(${Math.round(mx)}px)`, '--mc': c || undefined } as CSSProperties}
            title={`${m.name || 'Marker'}: drag to move, double-click to rename, alt-click removes`}
            onPointerDown={e => { e.stopPropagation(); onMarker(m, e) }} onDoubleClick={e => { e.stopPropagation(); setRenaming(m.id) }}
            data-marker={m.id}>
            <i />
            {renaming === m.id
              ? <input autoFocus className="tl-mname" defaultValue={m.name} spellCheck={false} onPointerDown={e => e.stopPropagation()} onFocus={e => e.currentTarget.select()}
                  onBlur={e => done(m, e.currentTarget.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(m, e.currentTarget.value); if (e.key === 'Escape') setRenaming(null) }} />
              : <span>{m.name.slice(0, TL.markerLabelMax)}</span>}
          </div>
        )
      })}
    </div>
  )
}
export default memo(Ruler)

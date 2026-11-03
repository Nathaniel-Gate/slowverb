import { memo, useEffect, useRef, type PointerEvent as RPointerEvent } from 'react'
import type { Marker } from '../model'
import { TL } from '../../config/timeline'
import { cachedVars, formatTick, pickStep } from './timelineMath'

type Props = {
  width: number; pxPerSec: number; scrollX: number
  markers: Marker[]; markIn: number | null; markOut: number | null
  onDown: (e: RPointerEvent) => void
  onMarker: (id: string, t: number, alt: boolean) => void
}
const VARS = ['--tl-tick', '--tl-tick-minor', '--tl-label', '--tl-ruler-line']

function Ruler({ width, pxPerSec, scrollX, markers, markIn, markOut, onDown, onMarker }: Props) {
  const cv = useRef<HTMLCanvasElement>(null)

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
  return (
    <div className="tl-ruler" onPointerDown={onDown}>
      <canvas ref={cv} style={{ width, height: TL.rulerH }} />
      {range && <div className="tl-ruler-range" style={{ transform: `translateX(${x(markIn!)}px)`, width: (markOut! - markIn!) * pxPerSec }} />}
      {markIn !== null && <div className="tl-bracket in" style={{ transform: `translateX(${x(markIn)}px)` }} />}
      {markOut !== null && <div className="tl-bracket out" style={{ transform: `translateX(${x(markOut)}px)` }} />}
      {markers.map(m => {
        const mx = x(m.t)
        if (mx < -80 || mx > width + 4) return null
        return (
          <div key={m.id} className="tl-marker" style={{ transform: `translateX(${mx}px)` }} title={`${m.name || 'Marker'} (alt-click removes)`}
            onPointerDown={e => { e.stopPropagation(); onMarker(m.id, m.t, e.altKey) }}>
            <i /><span>{m.name.slice(0, TL.markerLabelMax)}</span>
          </div>
        )
      })}
    </div>
  )
}
export default memo(Ruler)

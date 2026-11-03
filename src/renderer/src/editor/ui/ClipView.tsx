import { memo, useEffect, useRef } from 'react'
import { clipDur, clipSpeed, type Clip } from '../model'
import type { Peaks } from '../peaks'
import { TL, labelColor } from '../../config/timeline'
import { drawWave } from './drawWave'
import { cachedVars, clipTitle, fmtDb, gainToY } from './timelineMath'

type Props = {
  clip: Clip; y: number; h: number; selected: boolean; locked: boolean; dim: boolean; ghost: boolean; stripe: string
  peaks: Peaks | undefined; pxPerSec: number; scrollX: number; viewW: number
}
const VARS = ['--tl-wave', '--tl-wave-sel', '--tl-fade-shade', '--tl-fade-line']

// One clip: a DOM box (hover, outline, label, handles) with a canvas that draws only the visible slice.
function ClipView({ clip, y, h, selected, locked, dim, ghost, stripe, peaks, pxPerSec: pps, scrollX, viewW }: Props) {
  const cv = useRef<HTMLCanvasElement>(null)
  const dur = clipDur(clip), speed = clipSpeed(clip)
  const xL = Math.round(clip.start * pps - scrollX), xR = Math.round((clip.start + dur) * pps - scrollX)
  const w = Math.max(1, xR - xL)
  const vx0 = Math.max(0, xL), vx1 = Math.min(viewW, xR), cw = Math.max(0, vx1 - vx0), cl = vx0 - xL

  useEffect(() => {
    const c = cv.current
    if (!c || cw <= 0) return
    const dpr = window.devicePixelRatio || 1
    const pw = Math.round(cw * dpr), ph = Math.round(h * dpr)
    if (c.width !== pw) c.width = pw
    if (c.height !== ph) c.height = ph
    const col = cachedVars(c, VARS)
    drawWave(c.getContext('2d')!, {
      w: cw, h, dpr, clipLeft: -cl, clipW: w, pk: peaks, pps, srcIn: clip.srcIn, srcOut: clip.srcOut, speed,
      u0: (vx0 + scrollX) / pps - clip.start, gain: clip.gain, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut,
      wave: selected ? col['--tl-wave-sel'] : col['--tl-wave'], fadeShade: col['--tl-fade-shade'], fadeLine: col['--tl-fade-line']
    })
  }, [peaks, pps, scrollX, cw, cl, w, h, vx0, clip.start, clip.srcIn, clip.srcOut, clip.gain, clip.fadeIn, clip.fadeOut, speed, selected])

  const detail = h >= TL.detailMinH && !locked && w > 3 * TL.fadeHandlePx
  const fi = Math.min(clip.fadeIn * pps, w - TL.fadeHandlePx), fo = Math.min(clip.fadeOut * pps, w - TL.fadeHandlePx)
  const lbl = labelColor(clip.label)
  const off = Math.min(Math.max(0, -xL), Math.max(0, w - 48))
  return (
    <div className="tl-clip" data-clip={clip.id} data-selected={selected || undefined} data-locked={locked || undefined}
      data-dim={dim || undefined} data-ghost={ghost || undefined} data-disabled={clip.disabled || undefined} data-label={lbl ? '' : undefined}
      style={{ width: w, height: h, transform: `translate(${xL}px, ${y}px)`, '--lbl': lbl || undefined, '--stripe': stripe } as React.CSSProperties}>
      <canvas ref={cv} style={{ left: cl, width: cw, height: h }} />
      <span className="tl-clip-label" style={{ transform: `translateX(${off}px)` }}>
        {clipTitle(clip)}
        {speed !== 1 && <b className="tl-badge">{Math.round(speed * 100)}%</b>}
        {Math.abs(clip.gain - 1) > 0.006 && <b className="tl-badge">{fmtDb(clip.gain)}</b>}
      </span>
      {!locked && <i className="tl-edge" data-edge="in" />}
      {!locked && <i className="tl-edge" data-edge="out" />}
      {detail && <i className="tl-fade" data-fade="in" style={{ transform: `translateX(${Math.max(0, fi)}px)` }} />}
      {detail && <i className="tl-fade" data-fade="out" style={{ transform: `translateX(${-Math.max(0, fo)}px)` }} />}
      {detail && <div className="tl-gain" data-gain style={{ transform: `translateY(${Math.round(gainToY(clip.gain, h))}px)` }}><i /></div>}
    </div>
  )
}
export default memo(ClipView)

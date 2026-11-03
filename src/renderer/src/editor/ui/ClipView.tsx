import { memo, useEffect, useRef } from 'react'
import { clipDur, type Clip } from '../model'
import type { Peaks } from '../peaks'
import { TL } from '../../config/timeline'
import { drawWave } from './drawWave'
import { baseName, cachedVars } from './timelineMath'

type Props = {
  clip: Clip; lane: number; selected: boolean; locked: boolean; dim: boolean; ghost: boolean
  peaks: Peaks | undefined; pxPerSec: number; scrollX: number; viewW: number
}
const VARS = ['--tl-wave', '--tl-wave-sel', '--tl-fade-shade', '--tl-fade-line']

// One clip: a DOM box (hover, outline, label, trim handles) with a canvas that draws only the visible slice.
function ClipView({ clip, lane, selected, locked, dim, ghost, peaks, pxPerSec: pps, scrollX, viewW }: Props) {
  const cv = useRef<HTMLCanvasElement>(null)
  const xL = Math.round(clip.start * pps - scrollX)
  const xR = Math.round((clip.start + clipDur(clip)) * pps - scrollX)
  const w = Math.max(1, xR - xL), h = TL.laneH - 2 * TL.clipPadY
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
      w: cw, h, dpr, clipLeft: -cl, clipW: w, pk: peaks, pps, srcIn: clip.srcIn, srcOut: clip.srcOut,
      u0: (vx0 + scrollX) / pps - clip.start, gain: clip.gain, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut,
      wave: selected ? col['--tl-wave-sel'] : col['--tl-wave'], fadeShade: col['--tl-fade-shade'], fadeLine: col['--tl-fade-line']
    })
  }, [peaks, pps, scrollX, cw, cl, w, h, vx0, clip.start, clip.srcIn, clip.srcOut, clip.gain, clip.fadeIn, clip.fadeOut, selected])

  const db = clip.gain > 0 ? 20 * Math.log10(clip.gain) : -Infinity
  const gainTxt = Math.abs(db) < 0.05 ? '' : ` ${db > 0 ? '+' : ''}${isFinite(db) ? db.toFixed(1) : '-inf'} dB`
  return (
    <div className="tl-clip" data-clip={clip.id} data-selected={selected || undefined} data-locked={locked || undefined}
      data-dim={dim || undefined} data-ghost={ghost || undefined}
      style={{ width: w, height: h, transform: `translate(${xL}px, ${lane * TL.laneH + TL.clipPadY}px)` }}>
      <canvas ref={cv} style={{ left: cl, width: cw, height: h }} />
      <span className="tl-clip-label" style={{ transform: `translateX(${Math.min(Math.max(0, -xL), Math.max(0, w - 48))}px)` }}>
        {baseName(clip.src)}{gainTxt}
      </span>
      {!locked && <i className="tl-edge" data-edge="in" />}
      {!locked && <i className="tl-edge" data-edge="out" />}
    </div>
  )
}
export default memo(ClipView)

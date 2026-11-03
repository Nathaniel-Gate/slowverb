import { memo, useLayoutEffect, useRef } from 'react'
import { clipDur, clipSpeed, type Clip } from '../model'
import type { Peaks } from '../peaks'
import { TL, labelColor } from '../../config/timeline'
import { drawWave } from './drawWave'
import { cachedVars, clipTitle, fmtDb } from './timelineMath'
import { EnvLayer } from './EnvLayer'
import { FadeHandles } from './FadeHandles'

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
  const w = Math.max(1, xR - xL), tiny = w < TL.minHitPx   // zoomed far out: keep a wide invisible grab area around the sliver
  const vx0 = Math.max(0, xL), vx1 = Math.min(viewW, xR), cw = Math.max(0, vx1 - vx0), cl = vx0 - xL

  useLayoutEffect(() => {   // draw in the same frame as the DOM change so handles and waveform never disagree
    const c = cv.current
    if (!c || cw <= 0) return
    const dpr = window.devicePixelRatio || 1
    const pw = Math.round(cw * dpr), ph = Math.round(h * dpr)
    if (c.width !== pw) c.width = pw
    if (c.height !== ph) c.height = ph
    const col = cachedVars(c, VARS)
    drawWave(c.getContext('2d')!, {
      w: cw, h, dpr, clipLeft: -cl, clipW: w, pk: peaks, pps, srcIn: clip.srcIn, srcOut: clip.srcOut, speed,
      u0: (vx0 + scrollX) / pps - clip.start, gain: clip.gain, fadeIn: clip.fadeIn, fadeOut: clip.fadeOut, fadeInCurve: clip.fadeInCurve, fadeOutCurve: clip.fadeOutCurve, env: clip.env,
      wave: selected ? col['--tl-wave-sel'] : col['--tl-wave'], fadeShade: col['--tl-fade-shade'], fadeLine: col['--tl-fade-line']
    })
  }, [peaks, pps, scrollX, cw, cl, w, h, vx0, clip.start, clip.srcIn, clip.srcOut, clip.gain, clip.fadeIn, clip.fadeOut, clip.fadeInCurve, clip.fadeOutCurve, clip.env, speed, selected])

  const detail = h >= TL.detailMinH && !locked && w > 3 * TL.fadeHandlePx
  const lbl = labelColor(clip.label)
  const off = Math.min(Math.max(0, -xL), Math.max(0, w - 48))
  return (
    <div className="tl-clip" data-clip={clip.id} data-selected={selected || undefined} data-locked={locked || undefined}
      data-dim={dim || undefined} data-ghost={ghost || undefined} data-disabled={clip.disabled || undefined} data-label={lbl ? '' : undefined}
      data-tiny={tiny || undefined}
      style={{ width: w, height: h, transform: `translate(${xL}px, ${y}px)`, '--lbl': lbl || undefined, '--stripe': stripe, '--hit-pad': tiny ? `${(TL.minHitPx - w) / 2}px` : undefined } as React.CSSProperties}>
      <canvas ref={cv} style={{ left: cl, width: cw, height: h }} />
      <span className="tl-clip-label" style={{ transform: `translateX(${off}px)` }}>
        {clipTitle(clip)}
        {speed !== 1 && <b className="tl-badge">{Math.round(speed * 100)}%</b>}
        {Math.abs(clip.gain - 1) > 0.006 && <b className="tl-badge">{fmtDb(clip.gain)}</b>}
      </span>
      {!locked && !tiny && <i className="tl-edge" data-edge="in" />}
      {!locked && !tiny && <i className="tl-edge" data-edge="out" />}
      {detail && <EnvLayer clip={clip} w={w} h={h} pps={pps} />}
      {detail && <FadeHandles w={w} fadeIn={clip.fadeIn * pps} fadeOut={clip.fadeOut * pps} side={w >= TL.fadeMinSideW} />}
    </div>
  )
}
export default memo(ClipView)

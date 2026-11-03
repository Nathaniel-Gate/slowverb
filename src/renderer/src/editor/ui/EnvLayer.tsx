import { useMemo, useRef } from 'react'
import { TL } from '../../config/timeline'
import type { Clip } from '../model'
import { envPolyline } from './envMath'
import { gainToY } from './timelineMath'

// The volume rubber band of one clip, drawn as SVG over the waveform: a line at the clip's gain level that follows
// Clip.env, with a dot per envelope point. Pointer handling is in useTimelineInput (it finds [data-envline] / [data-env-pt]).
// Hovering the line shows where a new point would land (a ghost dot that follows the pointer, moved straight in the DOM).
type Props = { clip: Clip; w: number; h: number; pps: number }
export function EnvLayer({ clip, w, h, pps }: Props) {
  const ghost = useRef<SVGCircleElement>(null)
  const line = useMemo(() => envPolyline(clip, w, h, pps), [clip.env, clip.gain, w, h, pps])  // eslint-disable-line react-hooks/exhaustive-deps -- clip fields listed
  const pts = line.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const env = clip.env ?? []
  const yAt = (x: number) => {
    for (let i = 1; i < line.length; i++) if (x <= line[i].x || i === line.length - 1) {
      const a = line[i - 1], b = line[i], u = b.x === a.x ? 0 : Math.min(1, Math.max(0, (x - a.x) / (b.x - a.x)))
      return a.y + (b.y - a.y) * u
    }
    return line[0].y
  }
  const move = (e: React.PointerEvent<SVGElement>) => {
    const g = ghost.current; if (!g) return
    const x = e.clientX - e.currentTarget.ownerSVGElement!.getBoundingClientRect().left
    g.setAttribute('cx', String(x)); g.setAttribute('cy', String(yAt(x))); g.dataset.on = ''
  }
  const leave = () => { if (ghost.current) delete ghost.current.dataset.on }
  return (
    <svg className="tl-env" data-gain="" data-has={env.length || undefined} width={w} height={h} role="presentation">
      <polyline className="tl-env-halo" points={pts} />
      <polyline className="tl-env-line" points={pts} />
      <polyline className="tl-env-hit" data-envline="" points={pts} strokeWidth={TL.envHitPx * 2} onPointerMove={move} onPointerLeave={leave} />
      <circle ref={ghost} className="tl-env-ghost" r={TL.envPointPx - 1} />
      {env.map((p, i) => {
        const x = p.t * pps, y = gainToY(clip.gain * p.g, h)
        return (
          <g key={i} data-env-pt={i} transform={`translate(${x} ${y})`}>
            <circle className="tl-env-hitpt" r={TL.envPointHitPx} />
            <circle className="tl-env-pt" r={TL.envPointPx} />
          </g>
        )
      })}
    </svg>
  )
}

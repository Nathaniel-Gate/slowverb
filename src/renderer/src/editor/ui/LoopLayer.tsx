import { memo, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { clipEnd, type Clip, type Project } from '../model'
import { TL, trackColor } from '../../config/timeline'
import { loopBadge, loopGeom, type LoopHandle } from './loopMath'
import { clipBox, type Layout } from './timelineMath'

type Props = {
  project: Project; groups: Map<string, Clip[]>; layout: Layout; pps: number; scrollX: number; viewW: number
  selectedId: string | null; handles: boolean; onHandle: (e: RPointerEvent, which: LoopHandle, loopId: string) => void
}
const TITLE: Record<LoopHandle, string> = { in: 'Loop start point', out: 'Loop end point', xfade: 'Loop crossfade', count: 'Repeats' }

/** Visual group for every live loop: outline, badge, soft dividers in the crossfade zones; plus the drag handles of the selected loop. */
function LoopLayerImpl({ project, groups, layout, pps, scrollX, viewW, selectedId, handles, onHandle }: Props) {
  if (!project.loops?.length) return null
  const x = (t: number) => t * pps - scrollX
  return (
    <>
      {project.loops.map(loop => {
        const g = loopGeom(groups.get(loop.id))
        if (!g) return null
        const lane = Math.max(0, project.tracks.findIndex(t => t.id === g.first.track)), b = clipBox(layout, lane)
        const xs = x(g.start), xe = x(g.end), w = Math.max(2, xe - xs)
        if (xe < 0 || xs > viewW) return null
        const sel = loop.id === selectedId, locked = !!project.tracks[lane]?.lock
        const badge = loopBadge({ count: g.count, xfade: g.xfade })
        const off = Math.min(Math.max(0, -xs), Math.max(0, w - 96))
        // dividers: one SVG path, at the middle of every crossfade zone, only those in view
        let d = ''
        const tile = g.period * pps
        if (g.second && tile >= TL.loopDividerMinPx) {
          const c0 = x(g.second.start) + (g.xfade * pps) / 2
          const k0 = Math.max(0, Math.floor((-2 - c0) / tile)), k1 = Math.min(g.count - 2, Math.ceil((viewW + 2 - c0) / tile))
          for (let k = k0; k <= k1; k++) d += `M${(c0 + k * tile).toFixed(2)} 0V${b.h}`
        }
        const hx = (px: number) => px - TL.loopHandlePx / 2
        const showH = sel && handles && !locked && clipEnd(g.first) * pps - g.start * pps >= TL.loopHandleMinW
        const topH = Math.round(b.h * TL.loopTopFrac)
        const H = (which: LoopHandle, px: number) => {
          const bottom = which === 'xfade' || which === 'count'
          return (
            <div key={which} className="tl-lh" data-loop-handle={which} data-loop-id={loop.id} title={TITLE[which]} data-bottom={bottom || undefined}
              style={{ transform: `translate(${hx(px)}px, ${b.y + (bottom ? topH : 0)}px)`, height: bottom ? b.h - topH : topH, width: TL.loopHandlePx }}
              onPointerDown={e => onHandle(e, which, loop.id)}><i /></div>
          )
        }
        return (
          <div key={loop.id}>
            <div className="tl-loop" data-selected={sel || undefined} style={{ transform: `translate(${xs}px, ${b.y}px)`, width: w, height: b.h, '--stripe': trackColor(lane) } as CSSProperties}>
              <span className="tl-loop-badge mono" style={{ transform: `translateX(${off}px)` }}><b>{badge.name}</b>{g.count > 1 && <em>{badge.fade}</em>}</span>
            </div>
            {d && <svg className="tl-loop-div" width={viewW} height={b.h} style={{ transform: `translateY(${b.y}px)`, '--stripe': trackColor(lane) } as CSSProperties}><path d={d} /></svg>}
            {showH && <>
              {H('in', x(g.start))}{H('out', x(clipEnd(g.first)))}
              {g.second && H('xfade', x(g.second.start))}{H('count', x(g.end))}
            </>}
          </div>
        )
      })}
    </>
  )
}
export const LoopLayer = memo(LoopLayerImpl)

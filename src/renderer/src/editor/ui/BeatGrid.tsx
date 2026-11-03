import { memo, useEffect, useRef } from 'react'
import type { Project } from '../model'
import { beatGrid } from '../ops'
import { TL } from '../../config/timeline'
import { cachedVars } from './timelineMath'

type Props = { project: Project; pps: number; scrollX: number; viewW: number; height: number }
const VARS = ['--tl-beat', '--tl-beat-bar']

/** Beat lines across the lanes (only the visible range; stronger every bar). Hidden when the beats would be too tight to read. */
function BeatGrid({ project, pps, scrollX, viewW, height }: Props) {
  const cv = useRef<HTMLCanvasElement>(null)
  const bpm = project.bpm, off = project.bpmOffset ?? 0
  useEffect(() => {
    const c = cv.current
    if (!c || !bpm || viewW <= 0 || height <= 0) return
    const dpr = window.devicePixelRatio || 1
    c.width = Math.round(viewW * dpr); c.height = Math.round(height * dpr)
    const g = c.getContext('2d')!
    g.scale(dpr, dpr)
    const period = 60 / bpm
    if (period * pps < TL.beatMinPx) return
    const col = cachedVars(c, VARS), from = scrollX / pps, to = (scrollX + viewW) / pps
    for (const t of beatGrid(project, from, to)) {
      const bar = Math.round((t - off) / period) % TL.beatBarEvery === 0
      g.fillStyle = bar ? col['--tl-beat-bar'] : col['--tl-beat']
      g.fillRect(Math.round(t * pps - scrollX), 0, 1, height)
    }
  }, [project.bpm, project.bpmOffset, pps, scrollX, viewW, height])  // eslint-disable-line react-hooks/exhaustive-deps -- only bpm/offset feed the grid
  if (!bpm) return null
  return <canvas className="tl-beats" ref={cv} style={{ width: viewW, height }} />
}
export default memo(BeatGrid)

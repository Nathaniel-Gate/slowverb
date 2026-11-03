import { memo, useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react'
import { clipDur, type Project } from '../model'
import { useEditor } from '../editor.store'
import { editorTransport } from '../transport'
import { TL } from '../../config/timeline'
import { cancelGlide, endOf, st, type View } from './dragRunner'
import { cachedVars, clamp } from './timelineMath'

// Navigator bar under the lanes: the whole project as tiny clips, a draggable viewport box (edges zoom), and a zoom slider.
type Props = { project: Project; pps: number; scrollX: number; viewW: number; view: View }
const lo = Math.log(TL.minPps), hi = Math.log(TL.maxPps)

function Minimap({ project, pps, scrollX, viewW, view }: Props) {
  const area = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null), head = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(0)
  const playing = useEditor(s => s.playing), playhead = useEditor(s => s.playhead)
  const end = endOf(project), span = Math.max(end * (1 + TL.miniPad), (scrollX + viewW) / pps, 1), k = w / span   // minimap px per second

  useEffect(() => {
    const el = area.current
    if (!el) return
    const ro = new ResizeObserver(() => setW(Math.round(el.clientWidth)))
    ro.observe(el); setW(Math.round(el.clientWidth))
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const c = cv.current
    if (!c || w <= 0) return
    const dpr = window.devicePixelRatio || 1, h = TL.miniH - 10
    c.width = Math.round(w * dpr); c.height = Math.round(h * dpr)
    const g = c.getContext('2d')!, col = cachedVars(c, ['--tl-mini-clip'])
    g.scale(dpr, dpr); g.fillStyle = col['--tl-mini-clip']
    const rows = project.tracks.length, rh = Math.max(2, Math.min(8, h / Math.max(1, rows)))
    for (const cl of project.clips) {
      const i = project.tracks.findIndex(t => t.id === cl.track)
      if (i < 0) continue
      g.fillRect(Math.round(cl.start * k), 1 + i * rh, Math.max(1, Math.round(clipDur(cl) * k)), Math.max(1, rh - 1))
    }
  }, [project.clips, project.tracks, k, w])

  useEffect(() => {   // the minimap playhead follows the transport without touching React
    const el = head.current
    if (!el) return
    const put = (t: number) => { el.style.transform = `translateX(${Math.round(t * k)}px)` }
    if (!playing) return put(playhead)
    let raf = 0
    const loop = () => { put(editorTransport.position()); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, playhead, k])

  /** Pointer drag in minimap px; `fn` gets the pixel offset since the press. */
  const track = (e: RPointerEvent, fn: (dx: number) => void) => {
    e.stopPropagation(); e.preventDefault(); cancelGlide()
    const x0 = e.clientX
    const move = (ev: PointerEvent) => fn(ev.clientX - x0)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const vL = scrollX / pps * k, vW = Math.max(6, viewW / pps * k)
  const body = (e: RPointerEvent) => { const s0 = st().scrollX; track(e, dx => view.scrollTo(s0 + dx / k * st().pxPerSec)) }
  const edge = (side: 'l' | 'r') => (e: RPointerEvent) => {
    const s = st(), t0 = s.scrollX / s.pxPerSec, t1 = t0 + viewW / s.pxPerSec
    track(e, dx => {
      const dt = dx / k
      const a = side === 'l' ? clamp(t0 + dt, 0, t1 - TL.miniMinViewSec) : t0, b = side === 'r' ? Math.max(t1 + dt, t0 + TL.miniMinViewSec) : t1
      const next = clamp(viewW / (b - a), TL.minPps, TL.maxPps)
      st().setZoom(next, undefined); st().setScroll(a * next)
    })
  }
  const jump = (e: RPointerEvent) => {
    const r = area.current!.getBoundingClientRect(), t = (e.clientX - r.left) / k
    view.scrollTo(t * pps - viewW / 2)
    const s0 = st().scrollX
    track(e, dx => view.scrollTo(s0 + dx / k * st().pxPerSec))
  }
  const slider = Math.round(((Math.log(pps) - lo) / (hi - lo)) * TL.zoomSliderSteps)
  const set = (v: number) => view.zoomAt(viewW / 2, Math.exp(lo + (v / TL.zoomSliderSteps) * (hi - lo)))
  return (
    <div className="tl-mini" style={{ height: TL.miniH, '--p': `${slider / TL.zoomSliderSteps * 100}%` } as CSSProperties}>
      <div className="tl-mini-area" ref={area} onPointerDown={jump} title="Navigator: drag the box to scroll, its edges to zoom">
        <canvas ref={cv} style={{ width: w, height: TL.miniH - 10 }} />
        <div className="tl-mini-head" ref={head} />
        <div className="tl-mini-view" style={{ transform: `translateX(${vL}px)`, width: vW }} onPointerDown={body}>
          <i data-side="l" onPointerDown={edge('l')} /><i data-side="r" onPointerDown={edge('r')} />
        </div>
      </div>
      <div className="tl-zoom">
        <button className="tl-zbtn" title="Zoom out" onClick={() => view.zoomAt(viewW / 2, pps / TL.zoomStep, true)}>&minus;</button>
        <input type="range" min={0} max={TL.zoomSliderSteps} value={clamp(slider, 0, TL.zoomSliderSteps)} onChange={e => set(+e.target.value)} title="Zoom" />
        <button className="tl-zbtn" title="Zoom in" onClick={() => view.zoomAt(viewW / 2, pps * TL.zoomStep, true)}>+</button>
      </div>
    </div>
  )
}
export default memo(Minimap)

import { useEffect, useRef } from 'react'
import { PANELS } from '../../../config/panels'
import { pickLevel, type Peaks } from '../../peaks'
import { auditionPos } from './audition'
import { usePanels } from './panels.store'
import { fmtTime } from './timecode'

const pct = (t: number, d: number) => `${(Math.min(1, Math.max(0, t / d)) * 100).toFixed(3)}%`

/** Whole-song overview with draggable In/Out handles and an audition cursor (moved by rAF, never through the store). */
export function MiniWave({ path, peaks, duration }: { path: string; peaks: Peaks; duration: number }) {
  const cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null), cur = useRef<HTMLDivElement>(null)
  const r = usePanels((s) => s.ranges[path]) ?? { in: 0, out: duration }, auditioning = usePanels((s) => s.auditioning)

  useEffect(() => {   // draw the overview once per size/source
    const c = cv.current, b = box.current; if (!c || !b) return
    const draw = () => {
      const w = Math.max(1, Math.round(b.clientWidth)), h = PANELS.miniWaveH, dpr = devicePixelRatio || 1
      c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d')!; g.scale(dpr, dpr); g.clearRect(0, 0, w, h)
      const lv = pickLevel(peaks, duration / w), per = duration * peaks.rate / lv.spp / w
      g.fillStyle = 'rgb(251 251 250 / .75)'
      for (let x = 0; x < w; x++) {
        let lo = 0, hi = 0; const a = Math.floor(x * per), z = Math.max(a + 1, Math.floor((x + 1) * per))
        for (let i = a; i < z && i < lv.max.length; i++) { if (lv.min[i] < lo) lo = lv.min[i]; if (lv.max[i] > hi) hi = lv.max[i] }
        g.fillRect(x, h / 2 - hi * h / 2, 1, Math.max(1, (hi - lo) * h / 2))
      }
    }
    draw(); const ro = new ResizeObserver(draw); ro.observe(b); return () => ro.disconnect()
  }, [peaks, duration])

  useEffect(() => {   // audition cursor
    const el = cur.current; if (!el) return
    if (!auditioning) { el.style.opacity = '0'; return }
    let id = 0; const frame = () => { const t = auditionPos(); if (t !== null) { el.style.opacity = '1'; el.style.left = pct(t, duration) } id = requestAnimationFrame(frame) }
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id)
  }, [auditioning, duration])

  const drag = (which: 'in' | 'out') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); const b = box.current!, rect = b.getBoundingClientRect(); e.currentTarget.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => usePanels.getState().setRange(path, { [which]: ((ev.clientX - rect.left) / rect.width) * duration }, duration)
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  return (
    <div className="dk-mini">
      <div className="dk-mini-wave" ref={box} style={{ height: PANELS.miniWaveH }} onDoubleClick={() => usePanels.getState().setRange(path, { in: 0, out: duration }, duration)} title="Double-click to reset In/Out">
        <canvas ref={cv} style={{ height: PANELS.miniWaveH }} />
        <div className="dk-shade" style={{ left: 0, width: pct(r.in, duration) }} />
        <div className="dk-shade" style={{ left: pct(r.out, duration), right: 0 }} />
        <div className="dk-handle in" style={{ left: pct(r.in, duration) }} onPointerDown={drag('in')} title="In" />
        <div className="dk-handle out" style={{ left: pct(r.out, duration) }} onPointerDown={drag('out')} title="Out" />
        <div className="dk-cursor" ref={cur} />
      </div>
      <div className="dk-mini-t mono"><span>IN {fmtTime(r.in)}</span><span>{fmtTime(r.out - r.in)}</span><span>OUT {fmtTime(r.out)}</span></div>
    </div>
  )
}

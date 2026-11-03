import { useEffect, useRef, useState } from 'react'
import { EDITOR } from '../../../config/editorKeys'
import { PANELS } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import { MIN_CLIP, type Loop } from '../../model'
import { pickLevel, type Peaks } from '../../peaks'
import { fmtTime } from './timecode'

const L = EDITOR.loop
type View = { a: number; b: number }
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const minLen = MIN_CLIP * 4   // matches the ops' shortest loop slice
let gestures = 0

/** The loop plus a little either side. */
const fit = (l: Loop, dur: number): View => { const pad = Math.max((l.srcOut - l.srcIn) * L.wavePadFrac, L.wavePadMinSec); return { a: Math.max(0, l.srcIn - pad), b: Math.min(dur, l.srcOut + pad) } }
/** A window of `w` seconds centred on t. */
const around = (t: number, dur: number, w: number): View => { const ww = Math.min(w, dur), a = clamp(t - ww / 2, 0, dur - ww); return { a, b: a + ww } }
/** Zoom by `factor` keeping the time under `frac` (0..1 across the window) where it is. */
const zoom = (v: View, dur: number, factor: number, frac: number): View => {
  const w = v.b - v.a, nw = clamp(w / factor, Math.min(L.zoomMinWinSec, dur), dur), at = v.a + frac * w, a = clamp(at - frac * nw, 0, dur - nw)
  return { a, b: a + nw }
}
const winLabel = (s: number) => (s < 1 ? `${+(s * 1000).toFixed(s < 0.01 ? 2 : 1)} ms` : `${+s.toFixed(2)} s`)

/** Draw the window [a,b] of the source: peaks while zoomed out, the raw samples (joined by a line once they are wider than a pixel) when zoomed in. */
function draw(c: HTMLCanvasElement, w: number, v: View, peaks: Peaks, buf: AudioBuffer | undefined) {
  const h = PANELS.miniWaveH, dpr = devicePixelRatio || 1
  c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d')!; g.scale(dpr, dpr); g.clearRect(0, 0, w, h)
  const per = (v.b - v.a) / w, rate = peaks.rate, spp = per * rate, mid = h / 2
  g.fillStyle = 'rgb(251 251 250 / .75)'; g.strokeStyle = 'rgb(251 251 250 / .85)'
  if (buf && spp < peaks.levels[0].spp) {
    const chs = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i)), n = buf.length
    if (spp < 1) {   // sample level: connect the dots
      const s0 = Math.max(0, Math.floor(v.a * rate) - 1), s1 = Math.min(n - 1, Math.ceil(v.b * rate) + 1)
      g.beginPath()
      for (let s = s0; s <= s1; s++) { const x = (s / rate - v.a) / per, y = mid - chs[0][s] * mid; s === s0 ? g.moveTo(x, y) : g.lineTo(x, y) }
      g.stroke()
      if (1 / spp > 6) for (let s = s0; s <= s1; s++) g.fillRect((s / rate - v.a) / per - 1.5, mid - chs[0][s] * mid - 1.5, 3, 3)
      return
    }
    for (let x = 0; x < w; x++) {
      let lo = 0, hi = 0; const a = Math.floor((v.a + x * per) * rate), z = Math.max(a + 1, Math.floor((v.a + (x + 1) * per) * rate))
      for (const ch of chs) for (let i = a; i < z && i < n; i++) { if (ch[i] < lo) lo = ch[i]; if (ch[i] > hi) hi = ch[i] }
      g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid))
    }
    return
  }
  const lv = pickLevel(peaks, per), k = per * rate / lv.spp, off = v.a * rate / lv.spp
  for (let x = 0; x < w; x++) {
    let lo = 0, hi = 0; const a = Math.floor(off + x * k), z = Math.max(a + 1, Math.floor(off + (x + 1) * k))
    for (let i = a; i < z && i < lv.max.length; i++) { if (lv.min[i] < lo) lo = lv.min[i]; if (lv.max[i] > hi) hi = lv.max[i] }
    g.fillRect(x, mid - hi * mid, 1, Math.max(1, (hi - lo) * mid))
  }
}

/** The source around a loop's begin and end points, with two draggable handles. Zoom (buttons, Alt/Cmd + wheel) down to single samples. Reuses the
 *  MiniWave look (dk-mini-wave, dk-handle, dk-shade) but shows a window of the source instead of the whole song. */
export function LoopWave({ loop, peaks, buf, duration }: { loop: Loop; peaks: Peaks; buf?: AudioBuffer; duration: number }) {
  const cv = useRef<HTMLCanvasElement>(null), box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<View>(() => fit(loop, duration)), [w, setW] = useState(0), [drag, setDrag] = useState<'in' | 'out' | null>(null)
  const viewRef = useRef(view); viewRef.current = view
  const span = view.b - view.a, pos = (t: number) => (t - view.a) / span, pct = (t: number) => `${(clamp(pos(t), 0, 1) * 100).toFixed(3)}%`

  useEffect(() => setView(fit(loop, duration)), [loop.id, loop.src, duration])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {   // both points drifted out of sight (keys, typing): bring them back
    const tiny = (loop.srcOut - loop.srcIn) < (view.b - view.a) * L.refitBelowFrac   // loop shrank to a sliver of the window
    if (!drag && (tiny || loop.srcOut < view.a || loop.srcIn > view.b)) setView(fit(loop, duration))
  }, [loop.srcIn, loop.srcOut]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const b = box.current; if (!b) return; const ro = new ResizeObserver(() => setW(Math.max(1, Math.round(b.clientWidth)))); ro.observe(b); return () => ro.disconnect() }, [])
  useEffect(() => { const c = cv.current; if (c && w) draw(c, w, view, peaks, buf) }, [view, w, peaks, buf])

  useEffect(() => {   // Alt/Cmd/pinch + wheel zooms at the cursor, sideways swipe pans. Needs a non-passive listener to stop the dock scrolling.
    const b = box.current; if (!b) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current, rect = b.getBoundingClientRect()
      if (e.altKey || e.metaKey || e.ctrlKey) { e.preventDefault(); setView(zoom(v, duration, L.wheelZoom ** -e.deltaY, (e.clientX - rect.left) / rect.width)) }
      else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { e.preventDefault(); const dt = (e.deltaX / rect.width) * (v.b - v.a), a = clamp(v.a + dt, 0, duration - (v.b - v.a)); setView({ a, b: a + (v.b - v.a) }) }
    }
    b.addEventListener('wheel', onWheel, { passive: false }); return () => b.removeEventListener('wheel', onWheel)
  }, [duration])

  const start = (which: 'in' | 'out') => (e: React.PointerEvent) => {
    e.preventDefault(); e.stopPropagation(); const el = e.currentTarget as HTMLElement; el.setPointerCapture(e.pointerId)
    const rect = box.current!.getBoundingClientRect(), perPx = (viewRef.current.b - viewRef.current.a) / rect.width, key = which === 'in' ? 'srcIn' : 'srcOut'
    const gesture = `loopdrag:${loop.id}:${which}:${++gestures}`, rate = peaks.rate
    let t = which === 'in' ? loop.srcIn : loop.srcOut, lastX = e.clientX, raf = 0, dirty = false
    const push = () => { raf = 0; if (!dirty) return; dirty = false; useEditor.getState().updateLoopLive(loop.id, { [key]: t }, gesture) }
    const move = (ev: PointerEvent) => {
      const cur = useEditor.getState().project?.loops?.find((l) => l.id === loop.id); if (!cur) return
      t += (ev.clientX - lastX) * perPx * (ev.altKey ? L.fineDrag : 1); lastX = ev.clientX   // delta based, so Alt can slow it down mid-drag
      t = Math.round(clamp(t, which === 'in' ? 0 : cur.srcIn + minLen, which === 'in' ? cur.srcOut - minLen : duration) * rate) / rate   // lands on a sample
      dirty = true; if (!raf) raf = requestAnimationFrame(push)
    }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (raf) cancelAnimationFrame(raf); push(); setDrag(null) }
    setDrag(which); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up)
  }

  const z = (f: number) => setView((v) => zoom(v, duration, f, 0.5))
  const lenSec = loop.srcOut - loop.srcIn, xf = Math.min(loop.xfade, lenSec / 2)
  const hide = (t: number) => t < view.a || t > view.b
  return (
    <div className="dk-mini">
      <div className="dk-mini-wave dk-lw" ref={box} style={{ height: PANELS.miniWaveH }} onDoubleClick={() => setView(fit(loop, duration))}
        title="Drag the handles. Option while dragging = fine. Option + wheel zooms, double-click fits the loop">
        <canvas ref={cv} style={{ height: PANELS.miniWaveH }} />
        {xf > 0 && <>
          <div className="dk-xf" style={{ left: pct(loop.srcIn), width: `${(clamp(pos(loop.srcIn + xf), 0, 1) - clamp(pos(loop.srcIn), 0, 1)) * 100}%` }} />
          <div className="dk-xf" style={{ left: pct(loop.srcOut - xf), width: `${(clamp(pos(loop.srcOut), 0, 1) - clamp(pos(loop.srcOut - xf), 0, 1)) * 100}%` }} />
        </>}
        <div className="dk-shade" style={{ left: 0, width: pct(loop.srcIn) }} />
        <div className="dk-shade" style={{ left: pct(loop.srcOut), right: 0 }} />
        <div className={`dk-handle in ${drag === 'in' ? 'drag' : ''}`} style={{ left: pct(loop.srcIn), display: hide(loop.srcIn) ? 'none' : undefined }} onPointerDown={start('in')} title="Loop start">
          {drag === 'in' && <span className="dk-hl mono">{fmtTime(loop.srcIn)}</span>}</div>
        <div className={`dk-handle out ${drag === 'out' ? 'drag' : ''}`} style={{ left: pct(loop.srcOut), display: hide(loop.srcOut) ? 'none' : undefined }} onPointerDown={start('out')} title="Loop end">
          {drag === 'out' && <span className="dk-hl mono r">{fmtTime(loop.srcOut)}</span>}</div>
      </div>
      <div className="dk-lz">
        <button className="chip" onClick={() => setView(fit(loop, duration))} title="Show the whole loop">FIT</button>
        <button className="chip" onClick={() => setView(around(loop.srcIn, duration, L.pointWinSec))} title="Zoom in on the start point">IN</button>
        <button className="chip" onClick={() => setView(around(loop.srcOut, duration, L.pointWinSec))} title="Zoom in on the end point">OUT</button>
        <span className="dk-lz-gap" />
        <button className="chip" onClick={() => z(1 / L.zoomStep)} title="Zoom out" aria-label="Zoom out">-</button>
        <span className="mono dk-dim dk-lz-w">{winLabel(span)}</span>
        <button className="chip" onClick={() => z(L.zoomStep)} title="Zoom in (Option + wheel)" aria-label="Zoom in">+</button>
      </div>
      <div className="dk-mini-t mono"><span>IN {fmtTime(loop.srcIn)}</span><span>{fmtTime(lenSec)}</span><span>OUT {fmtTime(loop.srcOut)}</span></div>
    </div>
  )
}

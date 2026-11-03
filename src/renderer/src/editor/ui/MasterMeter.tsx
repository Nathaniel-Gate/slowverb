import { useEffect, useRef, useState } from 'react'
import { PANELS } from '../../config/panels'
import { createMeter } from '../meter'
import { editorTransport } from '../transport'

type Meter = ReturnType<typeof createMeter>
let meter: Meter | null = null   // one tap on the master output for the whole app
const getMeter = (): Meter => (meter ??= createMeter(editorTransport.ctx, editorTransport.analyser))

/** 0..1 linear level -> 0..1 bar position on a dB scale (floor in config). */
const pos = (v: number) => (v <= 0 ? 0 : Math.min(1, Math.max(0, (20 * Math.log10(v) - PANELS.meterFloorDb) / -PANELS.meterFloorDb)))

/** Stereo master meter: smoothed bars + peak-hold ticks drawn with transforms from a rAF loop (no React state per frame). Click the lamp to clear a clip. */
export function MasterMeter() {
  const bars = useRef<(HTMLDivElement | null)[]>([]), holds = useRef<(HTMLDivElement | null)[]>([]), db = useRef<HTMLSpanElement>(null)
  const [clip, setClip] = useState(false), latched = useRef(false)
  useEffect(() => {
    let id = 0, m: Meter
    try { m = getMeter() } catch (e) { console.error('[meter] unavailable', e); return }
    const frame = () => {
      const r = m.read(), lv = [r.l, r.r], pk = [r.peakL, r.peakR]
      for (let i = 0; i < 2; i++) {
        bars.current[i]?.style.setProperty('transform', `scaleX(${pos(lv[i]).toFixed(4)})`)
        holds.current[i]?.style.setProperty('transform', `translateX(${((pos(pk[i]) - 1) * 100).toFixed(2)}%)`)
      }
      const top = Math.max(r.peakL, r.peakR)
      if (db.current) db.current.textContent = top > 0 ? (20 * Math.log10(top)).toFixed(1) : '-inf'
      if (!latched.current && Math.max(r.l, r.r, r.peakL, r.peakR) >= PANELS.meterClipAt) { latched.current = true; setClip(true) }
      id = requestAnimationFrame(frame)
    }
    id = requestAnimationFrame(frame); return () => cancelAnimationFrame(id)
  }, [])
  return (
    <div className="dk-sec dk-meter">
      <div className="row"><span className="mono">MASTER LEVEL</span>
        <span className="row" style={{ gap: 8 }}><span className="mono dk-dim"><span ref={db}>-inf</span> dB peak</span>
          <button className={`dk-clip ${clip ? 'on' : ''}`} title="Clip lamp: click to clear" aria-label="Clip lamp" onClick={() => { latched.current = false; setClip(false) }} /></span></div>
      {[0, 1].map((i) => (
        <div key={i} className="dk-mbar"><span className="mono">{i ? 'R' : 'L'}</span>
          <div className="dk-mtrack"><div className="dk-mfill" ref={(el) => { bars.current[i] = el }} /><div className="dk-mhold" ref={(el) => { holds.current[i] = el }} /></div></div>
      ))}
      <div className="dk-mscale mono">{PANELS.meterTicksDb.map((d) => <span key={d} style={{ left: `${((d - PANELS.meterFloorDb) / -PANELS.meterFloorDb) * 100}%` }}>{d}</span>)}</div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clipDur, type Project } from '../model'
import { useEditor } from '../editor.store'
import { editorTransport } from '../transport'
import { TL } from '../../config/timeline'
import ClipView from './ClipView'
import Ruler from './Ruler'
import { pickStep } from './timelineMath'
import { useTimelineInput, type Marquee } from './useTimelineInput'

export function Timeline() {
  const project = useEditor(s => s.project)
  const peaks = useEditor(s => s.peaks)
  const selection = useEditor(s => s.selection)
  const tool = useEditor(s => s.tool)
  const pps = useEditor(s => s.pxPerSec)
  const scrollX = useEditor(s => s.scrollX)
  const markIn = useEditor(s => s.markIn)
  const markOut = useEditor(s => s.markOut)

  const root = useRef<HTMLDivElement>(null), lanes = useRef<HTMLDivElement>(null)
  const razor = useRef<HTMLDivElement>(null), head = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(0)
  const [preview, setPreview] = useState<Project | null>(null)
  const [snapAt, setSnapAt] = useState<number | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const lastSnap = useRef(0)
  if (snapAt !== null) lastSnap.current = snapAt

  const ui = useMemo(() => ({ setPreview, setSnapAt, setMarquee }), [])
  const input = useTimelineInput({ root, lanes, razor }, ui, !!project)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(Math.round(el.clientWidth)))
    ro.observe(el)
    setViewW(Math.round(el.clientWidth))
    return () => ro.disconnect()
  }, [!project])

  // Playhead: transform only, position read from the transport every frame while playing (never via zustand).
  useEffect(() => {
    const el = head.current
    if (!el) return
    let raf = 0, prevX = -1
    const place = () => {
      const s = useEditor.getState(), t = s.playing ? editorTransport.position() : s.playhead
      const x = t * s.pxPerSec - s.scrollX, w = lanes.current?.clientWidth ?? 0
      el.style.transform = `translate3d(${Math.round(x)}px,0,0)`
      if (TL.followPlayhead && s.playing && prevX >= 0 && prevX <= w && x > w && !root.current?.dataset.drag)
        s.setScroll(Math.max(0, t * s.pxPerSec - w * TL.followMarginFrac))
      prevX = x
    }
    const loop = () => { place(); raf = requestAnimationFrame(loop) }
    const sync = () => {
      place()
      const playing = useEditor.getState().playing
      if (playing && !raf) raf = requestAnimationFrame(loop)
      if (!playing && raf) { cancelAnimationFrame(raf); raf = 0 }
    }
    sync()
    const off = useEditor.subscribe(sync)
    return () => { off(); if (raf) cancelAnimationFrame(raf) }
  }, [!project])

  // Vertical scroll stays in step with TrackHeaders (any element carrying TL.syncAttr), both directions.
  useEffect(() => {
    const onScroll = (e: Event) => {
      const t = e.target as HTMLElement, ln = lanes.current
      if (!ln || !(t instanceof HTMLElement)) return
      if (t === ln) {
        document.querySelectorAll<HTMLElement>(`[${TL.syncAttr}]`).forEach(h => { if (h.scrollTop !== ln.scrollTop) h.scrollTop = ln.scrollTop })
        window.dispatchEvent(new CustomEvent(TL.scrollYEvent, { detail: { top: ln.scrollTop } }))
      } else if (t.hasAttribute(TL.syncAttr) && ln.scrollTop !== t.scrollTop) ln.scrollTop = t.scrollTop
    }
    document.addEventListener('scroll', onScroll, true)
    return () => document.removeEventListener('scroll', onScroll, true)
  }, [])

  if (!project) return null
  const base = project, shown = preview ?? project
  const baseById = new Map(base.clips.map(c => [c.id, c]))
  const sel = new Set(selection)
  const anySolo = shown.tracks.some(t => t.solo)
  const laneOf = new Map(shown.tracks.map((t, i) => [t.id, i]))
  const trackOf = new Map(shown.tracks.map(t => [t.id, t]))
  const x = (t: number) => t * pps - scrollX
  const { step } = pickStep(pps)
  const stepPx = step * pps
  const contentH = shown.tracks.length * TL.laneH
  const visible = shown.clips.filter(c => x(c.start + clipDur(c)) >= 0 && x(c.start) <= viewW)
  const rangeOn = markIn !== null && markOut !== null && markOut > markIn

  return (
    <div className="tl" ref={root} data-tool={tool}
      style={{ '--tl-ruler-h': `${TL.rulerH}px`, '--tl-lane-h': `${TL.laneH}px`, '--tl-edge': `${TL.edgePx}px`, '--tl-dim': TL.dimMuted } as CSSProperties}>
      <Ruler width={viewW} pxPerSec={pps} scrollX={scrollX} markers={shown.markers} markIn={markIn} markOut={markOut}
        onDown={input.onRulerDown} onMarker={input.onMarker} />
      <div className="tl-lanes" ref={lanes} onPointerDown={input.onLanesDown} onPointerMove={input.onLanesMove} onPointerLeave={input.onLanesLeave}>
        <div className="tl-content" style={{ height: contentH, backgroundSize: `${stepPx}px 100%`, backgroundPosition: `${-scrollX}px 0` }}>
          {shown.tracks.map((t, i) => (
            <div key={t.id} className="tl-lane" data-odd={i % 2 || undefined} data-lock={t.lock || undefined} style={{ transform: `translateY(${i * TL.laneH}px)` }} />
          ))}
          {rangeOn && <div className="tl-range" style={{ transform: `translateX(${x(markIn!)}px)`, width: (markOut! - markIn!) * pps }} />}
          {shown.markers.map(m => (x(m.t) >= 0 && x(m.t) <= viewW ? <div key={m.id} className="tl-mline" style={{ transform: `translateX(${x(m.t)}px)` }} /> : null))}
          {visible.map(c => {
            const lane = laneOf.get(c.track) ?? 0, tr = trackOf.get(c.track)
            return (
              <ClipView key={c.id} clip={c} lane={lane} selected={sel.has(c.id)} locked={!!tr?.lock} dim={!!tr && (tr.mute || (anySolo && !tr.solo))}
                ghost={!!preview && baseById.get(c.id) !== c} peaks={peaks.get(c.src)} pxPerSec={pps} scrollX={scrollX} viewW={viewW} />
            )
          })}
          {marquee && (
            <div className="tl-marquee" style={{
              transform: `translate(${x(Math.min(marquee.t0, marquee.t1))}px, ${Math.min(marquee.y0, marquee.y1)}px)`,
              width: Math.abs(marquee.t1 - marquee.t0) * pps, height: Math.abs(marquee.y1 - marquee.y0)
            }} />
          )}
          <div className="tl-razor" ref={razor} />
        </div>
      </div>
      <div className="tl-overlay">
        <div className="tl-snap" data-on={snapAt !== null || undefined} style={{ transform: `translateX(${Math.round(x(lastSnap.current))}px)` }} />
        <div className="tl-playhead" ref={head}><div className="tl-playhead-cap" /></div>
      </div>
    </div>
  )
}

export default Timeline

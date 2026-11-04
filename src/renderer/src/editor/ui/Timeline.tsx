import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { clipDur, type Project } from '../model'
import { useEditor } from '../editor.store'
import { editorTransport } from '../transport'
import { TL, trackColor } from '../../config/timeline'
import BeatGrid from './BeatGrid'
import ClipView from './ClipView'
import Minimap from './Minimap'
import Ruler from './Ruler'
import { makeView } from './dragRunner'
import { useLaneLive } from './laneLive'
import { clipBox, layoutOf, overlaps, pickStep } from './timelineMath'
import type { Guides, Marquee, TimelineUi } from './timelineUi'
import { useDropTarget } from './useDropTarget'
import { useRulerInput } from './useRulerInput'
import { useLaneHover } from './useLaneHover'
import { useTimelineInput } from './useTimelineInput'
import { useRangeInput } from './useRangeInput'
import { RangeLayer } from './RangeLayer'
import { FadeCurvePopover } from './FadeHandles'
import { LoopLayer } from './LoopLayer'
import { expandLoopSelection, groupLoops, memberIndex, selectedLoopId } from './loopMath'
import { useLoopInput } from './useLoopInput'
import './timeline3.css'
import AudioLane from '../../clips/ui/AudioLane'
import { useClipMedia } from '../../clips/ui/useClipMedia'

type Flash = { id: number; t: number; y: number; h: number }
let flashId = 0

export function Timeline() {
  const project = useEditor(s => s.project)
  const peaks = useEditor(s => s.peaks)
  const selection = useEditor(s => s.selection)
  const tool = useEditor(s => s.tool)
  const pps = useEditor(s => s.pxPerSec)
  const scrollX = useEditor(s => s.scrollX)
  const markIn = useEditor(s => s.markIn)
  const markOut = useEditor(s => s.markOut)
  const loop = useEditor(s => s.loop)
  const gap = useEditor(s => s.gap)
  const showBeats = useEditor(s => s.showBeats)
  const hasRange = useEditor(s => !!s.range)
  const live = useLaneLive(s => s.live)
  const visual = useEditor(s => s.view === 'visual')

  const root = useRef<HTMLDivElement>(null), lanes = useRef<HTMLDivElement>(null), head = useRef<HTMLDivElement>(null)
  const razor = useRef<HTMLDivElement>(null), hot = useRef<HTMLDivElement>(null), ghost = useRef<HTMLDivElement>(null), hud = useRef<HTMLDivElement>(null)
  const [viewW, setViewW] = useState(0)
  const [preview, setPreview] = useState<Project | null>(null)
  const [snapAt, setSnapAt] = useState<number | null>(null)
  const [marquee, setMarquee] = useState<Marquee | null>(null)
  const [range, setRange] = useState<{ in: number; out: number } | null>(null)
  const [flashes, setFlashes] = useState<Flash[]>([])
  const lastSnap = useRef(0)
  if (snapAt !== null) lastSnap.current = snapAt

  const flash = useCallback((t: number, y: number, h: number) => {
    const f = { id: ++flashId, t, y, h }
    setFlashes(a => [...a, f])
    window.setTimeout(() => setFlashes(a => a.filter(x => x.id !== f.id)), TL.flashMs + 40)
  }, [])
  const view = useMemo(() => makeView({ root, lanes }), [])
  const ui: TimelineUi = useMemo(() => ({ setPreview, setSnapAt, setMarquee, setRange, flash }), [flash])
  const guides: Guides = { razor, hot, ghost, hud }
  const rangeIn = useRangeInput(view, { root, lanes }, guides)
  const input = useTimelineInput(view, { root, lanes }, guides, ui, !!project, rangeIn.rangeDown)
  const hover = useLaneHover(view, { root, lanes }, guides)
  const ruler = useRulerInput(view, ui, hud, root)
  const drop = useDropTarget(view, ghost)
  const loopIn = useLoopInput(view, { root, lanes }, guides, ui)
  const groups = useMemo(() => groupLoops((preview ?? project)?.clips ?? []), [preview?.clips, project?.clips])   // eslint-disable-line react-hooks/exhaustive-deps -- preview/project identity is enough
  const members = useMemo(() => memberIndex(groups), [groups])
  const mediaOf = useClipMedia((preview ?? project)?.sources)   // visual clips: thumbnails / filmstrip instead of a waveform

  // Selecting any repeat selects the whole loop (also after a click that narrowed a multi-selection).
  useEffect(() => {
    const next = expandLoopSelection(groupLoops(project?.clips ?? []), selection)
    if (next) useEditor.getState().select(next)
  }, [selection, project?.clips])

  useEffect(() => {
    const el = root.current
    if (!el) return
    const ro = new ResizeObserver(() => setViewW(Math.round(el.clientWidth)))
    ro.observe(el); setViewW(Math.round(el.clientWidth))
    return () => ro.disconnect()
  }, [!project])

  // Playhead: transform only, position read from the transport every frame while playing (never via zustand).
  // Follow: when the playhead crosses the view edge during playback, turn the page (glide or instant, TL.followMode).
  useEffect(() => {
    const el = head.current
    if (!el) return
    let raf = 0, prevX = -1, lastFlip = 0
    const place = () => {
      const s = useEditor.getState(), t = s.playing ? editorTransport.position() : s.playhead
      const x = t * s.pxPerSec - s.scrollX, w = lanes.current?.clientWidth ?? 0
      el.style.transform = `translate3d(${Math.round(x)}px,0,0)`
      const now = performance.now()
      if (TL.followMode !== 'off' && s.playing && prevX >= 0 && prevX <= w && (x > w || x < 0) && !root.current?.dataset.drag && now - lastFlip > TL.glideMs + 80) {
        const target = t * s.pxPerSec - w * TL.followMarginFrac
        lastFlip = now
        if (TL.followMode === 'glide') view.glideScroll(target); else view.scrollTo(target)
      }
      prevX = x
    }
    const loopFn = () => { place(); raf = requestAnimationFrame(loopFn) }
    const sync = () => {
      place()
      const playing = useEditor.getState().playing
      if (playing && !raf) raf = requestAnimationFrame(loopFn)
      if (!playing && raf) { cancelAnimationFrame(raf); raf = 0 }
    }
    sync()
    const off = useEditor.subscribe(sync)
    return () => { off(); if (raf) cancelAnimationFrame(raf) }
  }, [!project])  // eslint-disable-line react-hooks/exhaustive-deps -- view is stable

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
  const selLoop = selectedLoopId(base, preview ? groupLoops(base.clips) : groups, selection)   // the loop whose handles show
  const anySolo = shown.tracks.some(t => t.solo)
  const L = layoutOf(shown.tracks, live)
  const laneOf = new Map(shown.tracks.map((t, i) => [t.id, i]))
  const trackOf = new Map(shown.tracks.map(t => [t.id, t]))
  const x = (t: number) => t * pps - scrollX
  const stepPx = pickStep(pps).step * pps
  const visible = shown.clips.filter(c => x(c.start + clipDur(c)) >= 0 && x(c.start) <= viewW)
  const rIn = range?.in ?? markIn, rOut = range?.out ?? markOut
  const rangeOn = rIn !== null && rOut !== null && rOut > rIn
  const gapLane = gap ? laneOf.get(gap.track) : undefined
  const xfades = overlaps(shown)

  return (
    <div className="tl" ref={root} data-tool={tool} tabIndex={-1} onDragOver={drop.onDragOver} onDragLeave={drop.onDragLeave} onDrop={drop.onDrop}
      style={{ '--tl-ruler-h': `${TL.rulerH}px`, '--tl-edge': `${TL.edgePx}px`, '--tl-handle': `${TL.fadeHandlePx}px`, '--tl-gain-hit': `${TL.gainHitPx}px`, '--tl-fadezone': `${TL.fadeZoneFrac * 100}%`, '--tl-fadeside': `${TL.fadeSidePx}px`, '--tl-dot': `${TL.fadeDotPx}px`, '--tl-dot-y': `${TL.fadeDotY}px`, '--tl-dim': TL.dimMuted, '--tl-flash': `${TL.flashMs}ms` } as CSSProperties}>
      <Ruler width={viewW} pxPerSec={pps} scrollX={scrollX} markers={shown.markers} markIn={rIn} markOut={rOut} loop={loop}
        onDown={ruler.onRulerDown} onMarker={ruler.onMarker} onRange={ruler.onRange} onContext={ruler.onRulerContext} />
      {visual && <AudioLane pps={pps} scrollX={scrollX} viewW={viewW} />}
      <div className="tl-lanes" ref={lanes} onPointerDown={input.onLanesDown} onPointerMove={hover.onLanesMove} onPointerLeave={hover.onLanesLeave}
        onDoubleClick={input.onLanesDoubleClick} onContextMenu={input.onLanesContext} onPointerDownCapture={loopIn.onSelectCapture}>
        <div className="tl-content" style={{ height: L.total, backgroundSize: `${stepPx}px 100%`, backgroundPosition: `${-scrollX}px 0` }}>
          {shown.tracks.map((t, i) => (
            <div key={t.id} className="tl-lane" data-odd={i % 2 || undefined} data-lock={t.lock || undefined} data-collapsed={t.collapsed || undefined}
              style={{ height: L.hs[i], transform: `translateY(${L.tops[i]}px)` }} />
          ))}
          {showBeats && shown.bpm ? <BeatGrid project={shown} pps={pps} scrollX={scrollX} viewW={viewW} height={L.total} /> : null}
          {rangeOn && !hasRange && <div className="tl-range" data-loop={loop || undefined} style={{ transform: `translateX(${x(rIn!)}px)`, width: (rOut! - rIn!) * pps }} />}
          <RangeLayer project={shown} layout={L} pps={pps} scrollX={scrollX} viewW={viewW} dragging={!!preview} onEdge={rangeIn.edgeDown} />
          {gap && gapLane !== undefined && (
            <div className="tl-gap" style={{ transform: `translate(${x(gap.start)}px, ${L.tops[gapLane]}px)`, width: (gap.end - gap.start) * pps, height: L.hs[gapLane] }} />
          )}
          {shown.markers.map(m => (x(m.t) >= 0 && x(m.t) <= viewW ? <div key={m.id} className="tl-mline" style={{ transform: `translateX(${x(m.t)}px)` }} /> : null))}
          {visible.map(c => {
            const lane = laneOf.get(c.track) ?? 0, tr = trackOf.get(c.track), b = clipBox(L, lane)
            return (
              <ClipView key={c.id} clip={c} y={b.y} h={b.h} selected={sel.has(c.id) || (!!c.loop && c.loop === selLoop)} rep={members.get(c.id)?.rep} locked={!!tr?.lock} stripe={trackColor(lane)}
                dim={!!tr && (tr.mute || (anySolo && !tr.solo))} ghost={!!preview && !c.loop && baseById.get(c.id) !== c}
                peaks={peaks.get(c.src)} pxPerSec={pps} scrollX={scrollX} viewW={viewW} media={mediaOf.get(c.src)} />
            )
          })}
          {xfades.map(o => {
            const lane = laneOf.get(o.track) ?? 0, b = clipBox(L, lane)
            if (x(o.end) < 0 || x(o.start) > viewW) return null
            return (
              <div key={o.id} className="tl-xfade" data-loop={members.has(o.id.split('>')[0]) || undefined} style={{ transform: `translate(${x(o.start)}px, ${b.y}px)`, width: Math.max(2, (o.end - o.start) * pps), height: b.h }}>
                <svg viewBox="0 0 10 10" preserveAspectRatio="none"><path d="M0 10L10 0M0 0L10 10" vectorEffect="non-scaling-stroke" /></svg>
              </div>
            )
          })}
          <LoopLayer project={shown} groups={groups} layout={L} pps={pps} scrollX={scrollX} viewW={viewW} selectedId={selLoop} handles={tool === 'select'} onHandle={loopIn.onHandle} />
          {marquee && (
            <div className="tl-marquee" style={{
              transform: `translate(${x(Math.min(marquee.t0, marquee.t1))}px, ${Math.min(marquee.y0, marquee.y1)}px)`,
              width: Math.abs(marquee.t1 - marquee.t0) * pps, height: Math.abs(marquee.y1 - marquee.y0)
            }} />
          )}
          {flashes.map(f => <div key={f.id} className="tl-flash" style={{ transform: `translate(${x(f.t)}px, ${f.y}px)`, height: f.h }} />)}
          <div className="tl-razor" ref={razor} /><div className="tl-hot" ref={hot} /><div className="tl-dropghost" ref={ghost} />
        </div>
      </div>
      <FadeCurvePopover />
      <Minimap project={base} pps={pps} scrollX={scrollX} viewW={viewW} view={view} />
      <div className="tl-overlay">
        <div className="tl-snap" data-on={snapAt !== null || undefined} style={{ transform: `translateX(${Math.round(x(lastSnap.current))}px)` }} />
        <div className="tl-playhead" ref={head}><div className="tl-playhead-cap" /></div>
        <div className="tl-hud mono" ref={hud} />
      </div>
    </div>
  )
}

export default Timeline

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CLIPS } from '../../config/clips'
import { useEditor } from '../../editor/editor.store'
import { masterOf } from '../../editor/master'
import { editorTransport } from '../../editor/transport'
import { layersAt, paint, stageSize, type Layer } from '../compose'
import { imageFor, onImageReady } from '../imageCache'
import { setAspect } from '../opsVisual'
import { videoPool } from '../videoPool'

const drawableOf = (l: Layer) => (l.kind === 'video' ? videoPool.drawable(l) : imageFor(l.src))

/** Draw the Clips edit at timeline second t onto a canvas. Shared by the stage and the harness. Returns how many layers were drawn. */
export function drawFrame(cv: HTMLCanvasElement, t: number, playing = false): { drawn: number; layers: number } {
  const s = useEditor.getState(), p = s.project; if (!p) return { drawn: 0, layers: 0 }
  const heard = s.sound(), rate = heard ? masterOf(heard).speed : 1
  videoPool.sync(p, t, playing, rate)
  const g = cv.getContext('2d'); if (!g) return { drawn: 0, layers: 0 }
  const dpr = cv.width / Math.max(1, cv.clientWidth || cv.width)
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const layers = layersAt(p, t)
  return { drawn: paint(g, cv.width / dpr, cv.height / dpr, layers, drawableOf), layers: layers.length }
}

/** The preview: one canvas, sized to the chosen aspect inside the space above the timeline. The song is the clock: while playing,
 *  every animation frame reads the transport's position; while stopped it redraws on playhead or edit changes. */
export function Stage() {
  const project = useEditor((s) => s.project), playing = useEditor((s) => s.playing), playhead = useEditor((s) => s.playhead)
  const aspect = project?.stage?.aspect ?? CLIPS.defaultAspect
  const box = useRef<HTMLDivElement>(null), cv = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const el = box.current; if (!el) return
    const fit = () => setSize(stageSize(aspect, el.clientWidth, el.clientHeight))
    const ro = new ResizeObserver(fit); ro.observe(el); fit()
    return () => ro.disconnect()
  }, [aspect])

  useEffect(() => {   // canvas backing store follows the CSS size x device pixels
    const c = cv.current; if (!c || !size.w) return
    const dpr = Math.min(CLIPS.stageMaxDpr, window.devicePixelRatio || 1)
    c.width = Math.round(size.w * dpr); c.height = Math.round(size.h * dpr)
  }, [size])

  useEffect(() => {
    const c = cv.current; if (!c || !size.w) return
    const now = () => (useEditor.getState().playing ? editorTransport.position() : useEditor.getState().playhead)
    const redraw = () => drawFrame(c, now(), useEditor.getState().playing)
    videoPool.onFrame = () => { if (!useEditor.getState().playing) redraw() }
    const offImg = onImageReady(redraw)
    let raf = 0
    if (playing) { const loop = () => { redraw(); raf = requestAnimationFrame(loop) }; raf = requestAnimationFrame(loop) } else redraw()
    return () => { cancelAnimationFrame(raf); offImg() }
  }, [project, playing, playhead, size])

  useEffect(() => () => videoPool.clear(), [])

  return (
    <div className="cl-stage">
      <div className="cl-stage-box" ref={box}>
        <canvas ref={cv} className="cl-canvas" data-testid="clips-stage" style={{ width: size.w, height: size.h } as CSSProperties} />
        {project && !project.clips.length && <p className="cl-empty mono">Drag pictures or videos from MEDIA onto the timeline</p>}
      </div>
      <div className="cl-aspect" role="radiogroup" aria-label="Preview shape">
        <span className="mono">FRAME</span>
        {CLIPS.aspects.map((a) => (
          <button key={a} role="radio" aria-checked={a === aspect} className={`ghost ${a === aspect ? 'on' : ''}`}
            onClick={() => useEditor.getState().apply((p) => setAspect(p, a))}>{a}</button>
        ))}
      </div>
    </div>
  )
}

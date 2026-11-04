import { CLIPS } from '../../config/clips'
import { useEditor } from '../../editor/editor.store'
import type { Clip } from '../../editor/model'
import { Field } from '../../editor/ui/panels/Field'
import { parseNum } from '../../editor/ui/panels/timecode'
import { patchVisual, type VisualPatch } from '../opsVisual'

const common = <T,>(cs: Clip[], f: (c: Clip) => T): T | null => (cs.every((c) => f(c) === f(cs[0])) ? f(cs[0]) : null)

/** Inspector section for pictures and videos: opacity (the clip's gain), fit, slow push-in, and the video's own sound. */
export function InspectorVisual({ clips, videos }: { clips: Clip[]; videos: number }) {
  const ids = clips.map((c) => c.id), patch = (v: VisualPatch) => useEditor.getState().apply((p) => patchVisual(p, ids, v))
  const opacity = common(clips, (c) => Math.round(Math.min(1, c.gain) * 100)), fit = common(clips, (c) => c.fit ?? CLIPS.defaultFit)
  const zoom = common(clips, (c) => Math.round((c.zoom ?? 0) * 100)), audio = videos ? common(clips.filter((c) => useEditor.getState().project?.sources[c.src]?.kind === 'video'), (c) => !!c.audio) : null
  const op = opacity ?? 100
  return (
    <div className="dk-sec">
      <div className="row"><span className="mono">OPACITY %</span>
        <Field value={opacity} fmt={(v) => String(Math.round(v))} parse={parseNum} step={1} onCommit={(v) => useEditor.getState().patchSelected({ gain: Math.min(100, Math.max(0, v)) / 100 })} /></div>
      <input type="range" min={0} max={100} step={1} value={op} aria-label="Opacity" title="Double-click for 100%" style={{ '--p': `${op}%` } as React.CSSProperties}
        onChange={(e) => useEditor.getState().patchSelected({ gain: +e.target.value / 100 })} onDoubleClick={() => useEditor.getState().patchSelected({ gain: 1 })} />
      <div className="row"><span className="mono">FIT</span>
        <span className="dk-seg">
          <button className={`ghost ${fit === 'cover' ? 'on' : ''}`} onClick={() => patch({ fit: 'cover' })} title="Fill the frame (edges may be cropped)">FILL</button>
          <button className={`ghost ${fit === 'contain' ? 'on' : ''}`} onClick={() => patch({ fit: 'contain' })} title="Show the whole picture (bars at the sides)">WHOLE</button>
        </span></div>
      <div className="row"><span className="mono">PUSH-IN %</span>
        <Field value={zoom} fmt={(v) => String(Math.round(v))} parse={parseNum} step={1} onCommit={(v) => patch({ zoom: v / 100 })} /></div>
      <input type="range" min={0} max={CLIPS.zoomMax * 100} step={CLIPS.zoomStep * 100} value={zoom ?? 0} aria-label="Push-in" title="Slow zoom over the clip"
        style={{ '--p': `${((zoom ?? 0) / (CLIPS.zoomMax * 100)) * 100}%` } as React.CSSProperties} onChange={(e) => patch({ zoom: +e.target.value / 100 })} />
      {videos > 0 && (
        <label className="cl-switch mono" title="Play this video's own sound under the song (off = pictures only)">
          <input type="checkbox" role="switch" checked={!!audio} onChange={(e) => patch({ audio: e.target.checked })} /> INCLUDE VIDEO SOUND
        </label>
      )}
    </div>
  )
}

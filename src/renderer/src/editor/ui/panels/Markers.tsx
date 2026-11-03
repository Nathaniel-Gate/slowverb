import { LABELS } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import { TextField } from './Field'
import { fmtTime } from './timecode'

const nextColor = (c?: string) => { const i = LABELS.findIndex((l) => l.key === c); return i + 1 >= LABELS.length ? undefined : LABELS[i + 1].key }

export function Markers() {
  const markers = useEditor((s) => s.project?.markers), ed = useEditor.getState()
  const sorted = [...(markers ?? [])].sort((a, b) => a.t - b.t)
  const recolor = (id: string, color: string | undefined) => ed.apply((p) => ({ ...p, markers: p.markers.map((m) => (m.id === id ? { ...m, color } : m)) }))
  return (
    <div className="dk-stack">
      <div className="row"><span className="mono">{sorted.length} MARKERS</span>
        <button className="chip" onClick={() => useEditor.getState().markerAt(useEditor.getState().now())} title="Add a marker at the playhead (M)">+ ADD AT PLAYHEAD</button></div>
      <div className="dk-list">
        {sorted.map((m, i) => {
          const css = LABELS.find((l) => l.key === m.color)?.css
          return (
            <div key={m.id} className="dk-mark" style={{ animationDelay: `${Math.min(i, 8) * 24}ms` }}>
              <button className="dk-dot" style={{ '--c': css ?? 'var(--steel-500)' } as React.CSSProperties} title="Click to change colour" onClick={() => recolor(m.id, nextColor(m.color))} />
              <button className="mono dk-time" title="Jump to marker" onClick={() => useEditor.getState().gotoTime(m.t)}>{fmtTime(m.t)}</button>
              <TextField value={m.name} placeholder="Name" onCommit={(n) => useEditor.getState().renameMarker(m.id, n)} />
              <button className="ghost dk-x" title="Delete marker" onClick={() => useEditor.getState().removeMarker(m.id)}>&times;</button>
            </div>
          )
        })}
        {!sorted.length && <p className="dk-empty mono">No markers yet. Press M to drop one at the playhead.</p>}
      </div>
    </div>
  )
}

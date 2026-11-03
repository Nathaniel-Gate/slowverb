import { useLayoutEffect, useRef } from 'react'
import type { Tool } from '../model'
import type { ToolId } from '../../config/timeline'
import { useEditor } from '../editor.store'

const I = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
const TOOLS: { id: ToolId; label: string; key: string; icon: React.ReactNode }[] = [
  { id: 'select', label: 'Select', key: 'V', icon: <path d="M4.5 3l8 5.5-3.6.9 2 3.6-1.6.9-2-3.6-2.6 2.5z" {...I} /> },
  { id: 'razor', label: 'Razor', key: '⇧C', icon: <path d="M8 2v12M4 5l4-3 4 3M4 11l4 3 4-3" {...I} /> },
  { id: 'ripple', label: 'Ripple trim', key: 'B', icon: <path d="M4 3v10M4 8h8M9.5 5.5L12 8l-2.5 2.5" {...I} /> },
  { id: 'roll', label: 'Rolling edit (drag a cut)', key: 'N', icon: <path d="M8 2.5v11M5.5 5L3 8l2.5 3M10.5 5L13 8l-2.5 3" {...I} /> },
  { id: 'range', label: 'Range (drag across lanes; Option-drag from Select)', key: 'R', icon: <><path d="M3 4.5v7M13 4.5v7" {...I} /><path d="M5 6.5h6v3H5z" {...I} strokeDasharray="2 1.6" /></> },
  { id: 'rate', label: 'Rate stretch, ⇧R (drag a clip end)', key: '', icon: <path d="M3 4.5v7M13 4.5v7M5.5 8h5M8.5 5.8L11 8l-2.5 2.2" {...I} /> },
  { id: 'trackfwd', label: 'Track select forward (Shift: all tracks)', key: '', icon: <path d="M3 4h5M3 8h5M3 12h5M10 4.5l3 3.5-3 3.5" {...I} /> },
  { id: 'slip', label: 'Slip', key: 'Y', icon: <path d="M2.5 8h11M5 5.5L2.5 8 5 10.5M11 5.5L13.5 8 11 10.5" {...I} /> },
  { id: 'hand', label: 'Hand', key: 'H', icon: <path d="M5 8V4.2a1 1 0 012 0V8m0-.5V3.2a1 1 0 012 0V8m0-.5V4a1 1 0 012 0v5.2c0 2.4-1.6 4-3.8 4C5.6 13.2 5 12 4 10.4 3.4 9.4 3.8 8.6 5 9" {...I} /> },
  { id: 'zoom', label: 'Zoom tool', key: '⌥Z', icon: <><circle cx="7" cy="7" r="4" {...I} /><path d="M10 10l3.5 3.5" {...I} /></> }
]

/** Vertical tool column. A highlight slides to the active tool (same idea as the playlist tree). */
export function ToolStrip() {
  const tool = useEditor((s) => s.tool) as ToolId, snap = useEditor((s) => s.snap), { setTool, toggleSnap } = useEditor.getState()
  const box = useRef<HTMLDivElement>(null), pill = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-sel="1"]'), p = pill.current; if (!el || !p) return
    p.style.transform = `translateY(${el.offsetTop}px)`
  }, [tool])
  return (
    <div className="ed-tools">
      <div className="ed-tool-list" ref={box}>
        <div className="ed-tool-pill" ref={pill} />
        {TOOLS.map((t) => (
          <button key={t.id} data-sel={tool === t.id ? 1 : 0} className={`ed-tool ${tool === t.id ? 'on' : ''}`} title={t.key ? `${t.label} (${t.key})` : t.label} onPointerUp={(e) => e.currentTarget.blur()} onClick={() => setTool(t.id as Tool)}>
            <svg width="16" height="16" viewBox="0 0 16 16">{t.icon}</svg>{t.key && <span className="ed-key">{t.key}</span>}
          </button>
        ))}
      </div>
      <button className={`ed-snap mono ${snap ? 'on' : ''}`} title="Snap to edges, playhead and markers (S)" onPointerUp={(e) => e.currentTarget.blur()} onClick={toggleSnap}>SNAP</button>
    </div>
  )
}

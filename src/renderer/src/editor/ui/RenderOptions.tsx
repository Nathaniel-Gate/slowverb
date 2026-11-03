import type { RefObject } from 'react'
import { useEditor } from '../editor.store'
import { Popover } from './Popover'

/** Bit depth, normalise and In/Out-only toggles for RENDER. Saved between sessions. */
export function RenderOptions({ anchor, open, onClose }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void }) {
  const o = useEditor((s) => s.renderOpts), hasRange = useEditor((s) => s.markIn !== null && s.markOut !== null && s.markOut > s.markIn), set = useEditor.getState().setRenderOpts
  return (
    <Popover anchor={anchor} open={open} onClose={onClose} align="right" className="ed-render-pop">
      <div className="ed-pop-title mono">RENDER OPTIONS</div>
      <div className="ed-opt"><span>Bit depth</span>
        <span className="ed-seg">{([16, 24, 32] as const).map((b) => <button key={b} className={o.bitDepth === b ? 'on' : ''} onClick={() => set({ bitDepth: b })}>{b === 32 ? '32 float' : b}</button>)}</span>
      </div>
      <div className="ed-opt"><span>Normalise peak</span><button className={`ed-switch ${o.normalize ? 'on' : ''}`} role="switch" aria-checked={o.normalize} onClick={() => set({ normalize: !o.normalize })}><i /></button></div>
      <div className="ed-opt"><span>In to Out only</span><button className={`ed-switch ${o.range && hasRange ? 'on' : ''}`} role="switch" disabled={!hasRange} aria-checked={o.range} onClick={() => set({ range: !o.range })}><i /></button></div>
      <button className="ed-render ed-render-go" onClick={() => { onClose(); void useEditor.getState().renderToLibrary() }}>RENDER NOW</button>
    </Popover>
  )
}

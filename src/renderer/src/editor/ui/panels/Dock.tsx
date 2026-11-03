import { useEffect, useState } from 'react'
import { DOCK_TABS, PANELS, type DockTab } from '../../../config/panels'
import { useEditor } from '../../editor.store'
import { Bpm } from './Bpm'
import { Inspector } from './Inspector'
import { Markers } from './Markers'
import { Mix } from './Mix'
import { SourceBin } from './SourceBin'
import './panels.css'

const VIEWS: Record<DockTab, () => React.ReactNode> = { inspector: Inspector, source: SourceBin, markers: Markers, mix: Mix, bpm: Bpm }

/** Keep the panel mounted while its exit animation plays, so the dock keeps its width until the slide-out is done. */
function useExit(open: boolean) {
  const [mounted, setMounted] = useState(open)
  useEffect(() => {
    if (open) { setMounted(true); return }
    const id = window.setTimeout(() => setMounted(false), PANELS.closeMs); return () => clearTimeout(id)
  }, [open])
  return open || mounted
}

/** Right-hand dock: sliding-pill tab strip over one panel. Collapsed = a slim rail of tab letters. Width snaps, content slides (no per-frame layout). */
export function Dock() {
  const open = useEditor((s) => s.dockOpen), tab = useEditor((s) => s.dockTab), setDock = useEditor((s) => s.setDock)
  const mounted = useExit(open), View = VIEWS[tab] ?? Inspector, idx = Math.max(0, DOCK_TABS.findIndex((t) => t.id === tab))
  return (
    <aside className={`ed-dock ${mounted ? 'open' : 'rail'}`} aria-label="Panels">
      {mounted ? (
        <div className={`dk ${open ? 'in' : 'out'}`}>
          <div className="dk-head">
            <div className="dk-tabs" style={{ '--i': idx, '--n': DOCK_TABS.length } as React.CSSProperties} role="tablist">
              <div className="dk-pill" />
              {DOCK_TABS.map((t) => (
                <button key={t.id} role="tab" aria-selected={t.id === tab} className={t.id === tab ? 'on' : ''} onClick={() => setDock(t.id)}>{t.label}</button>
              ))}
            </div>
            <button className="ghost dk-fold" title="Collapse panels" onClick={() => setDock(null)}>&rsaquo;</button>
          </div>
          <div className="dk-body" key={tab}><View /></div>
        </div>
      ) : (
        <div className="dk-rail">
          <button className="ghost dk-fold" title="Open panels" onClick={() => setDock(tab)}>&lsaquo;</button>
          {DOCK_TABS.map((t) => <button key={t.id} className="dk-rail-tab mono" title={t.label} onClick={() => setDock(t.id)}>{t.short}</button>)}
        </div>
      )}
    </aside>
  )
}

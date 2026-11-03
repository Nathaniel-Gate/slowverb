import { useMemo, type RefObject } from 'react'
import { describeStep } from '../describe'
import { useEditor } from '../editor.store'
import { useOverlay } from '../overlayStore'
import { Popover } from './Popover'

/** Every undo step as a list, newest on top. Click a row to jump there (undo or redo in one go). */
export function HistoryPopover({ anchor }: { anchor: RefObject<HTMLElement | null> }) {
  const open = useOverlay((s) => s.history), hist = useEditor((s) => s.hist)
  const close = () => useOverlay.getState().set({ history: false })
  const rows = useMemo(() => {
    if (!open || !hist) return []
    const all = [...hist.past, hist.present, ...hist.future], cur = hist.past.length
    return all.map((p, i) => ({ i, label: i === 0 ? 'Start' : describeStep(all[i - 1], p), state: i === cur ? 'now' : i > cur ? 'redo' : 'undo', off: i - cur })).reverse()
  }, [open, hist])
  return (
    <Popover anchor={anchor} open={open} onClose={close} align="right" className="ed-hist">
      <div className="ed-pop-title mono">UNDO HISTORY</div>
      <div className="ed-hist-list">
        {rows.map((r) => (
          <button key={r.i} className={`ed-hist-row ${r.state}`} onClick={() => { useEditor.getState().jumpHistory(r.off); close() }}>
            <span className="mono ed-hist-n">{r.i}</span><span>{r.label}</span><span className="mono ed-hist-tag">{r.state === 'now' ? 'NOW' : r.state === 'redo' ? 'REDO' : ''}</span>
          </button>
        ))}
      </div>
    </Popover>
  )
}

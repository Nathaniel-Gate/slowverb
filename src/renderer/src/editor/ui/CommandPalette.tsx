import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { COMMANDS, getCommand, keysOf, recentCommands, type Command } from '../commands'
import { useEditor } from '../editor.store'
import { fuzzy } from '../fuzzy'
import { formatKey } from '../keyparse'
import { useOverlay } from '../overlayStore'

const Label = ({ text, at }: { text: string; at: number[] }) => {
  const set = new Set(at)
  return <>{[...text].map((ch, i) => set.has(i) ? <b key={i}>{ch}</b> : ch)}</>
}

export function CommandPalette() {
  const open = useOverlay((s) => s.palette)
  return open ? createPortal(<Palette />, document.body) : null
}

function Palette() {
  const [q, setQ] = useState(''), [sel, setSel] = useState(0), list = useRef<HTMLDivElement>(null)
  const state = useEditor.getState()
  const rows = useMemo(() => {
    if (!q.trim()) {
      const recent = recentCommands().map(getCommand).filter((c): c is Command => !!c)
      return [...recent, ...COMMANDS.filter((c) => !recent.includes(c))].map((c) => ({ c, at: [] as number[] }))
    }
    return COMMANDS.flatMap((c) => { const m = fuzzy(q, c.label) ?? fuzzy(q, `${c.group} ${c.label}`); return m ? [{ c, at: fuzzy(q, c.label) ? m.at : [], score: m.score }] : [] })
      .sort((a, b) => b.score - a.score)
  }, [q])
  useEffect(() => setSel(0), [q])
  useEffect(() => { list.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: 'nearest' }) }, [sel, rows])
  const close = () => useOverlay.getState().set({ palette: false })
  const run = (c: Command) => { close(); window.setTimeout(() => useEditor.getState().runCommand(c.id), 0) }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(rows.length - 1, s + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)) }
    else if (e.key === 'Enter' && rows[sel]) { e.preventDefault(); run(rows[sel].c) }
    else if (e.code === 'KeyP' && e.metaKey && e.shiftKey) { e.preventDefault(); close() }
  }
  return (
    <div className="ed-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) close() }}>
      <div className="ed-palette" role="dialog" aria-label="Command palette" onKeyDown={key}>
        <input autoFocus className="ed-palette-in" placeholder="Type a command" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="ed-palette-list" ref={list}>
          {rows.length === 0 && <div className="ed-palette-empty mono">No command matches</div>}
          {rows.map(({ c, at }, i) => {
            const k = keysOf(c.id)[0], off = c.when ? !c.when(state) : false
            return (
              <button key={c.id} data-on={i === sel ? 1 : 0} className={`ed-palette-row ${i === sel ? 'on' : ''} ${off ? 'off' : ''}`} onMouseMove={() => setSel(i)} onClick={() => run(c)}>
                <span className="ed-palette-label"><Label text={c.label} at={at} /></span>
                <span className="ed-palette-group mono">{c.group}</span>
                <span className="ed-palette-keys mono">{k ? formatKey(k) : ''}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { create } from 'zustand'
import { formatKey } from '../keyparse'
import { getCommand, keysOf, type MenuItem } from '../commands'
import { useEditor } from '../editor.store'
import { useOverlay } from '../overlayStore'

type M = { x: number; y: number; items: MenuItem[] } | null
const useMenu = create<{ menu: M }>(() => ({ menu: null }))
const close = () => { if (useMenu.getState().menu) { useMenu.setState({ menu: null }); useOverlay.getState().set({ menu: false }) } }

/** Show a right-click menu at screen (x, y). Build `items` by hand or with menuFor(). */
export function openContextMenu(x: number, y: number, items: MenuItem[]) {
  const rows = items.filter((i, n) => !(i.sep && (n === 0 || items[n - 1].sep)))   // no leading / doubled separators
  if (!rows.length) return
  useMenu.setState({ menu: { x, y, items: rows } }); useOverlay.getState().set({ menu: true })
}

/** Menu rows from command ids; '-' is a separator. Keys show the command's current binding, disabled follows its `when`. */
export function menuFor(ids: string[]): MenuItem[] {
  const s = useEditor.getState()
  return ids.flatMap((id): MenuItem[] => {
    if (id === '-') return [{ label: '', sep: true }]
    const c = getCommand(id); if (!c) return []
    const k = keysOf(id)[0]
    return [{ label: c.label, keys: k ? formatKey(k) : undefined, disabled: c.when ? !c.when(s) : false, run: () => useEditor.getState().runCommand(id) }]
  })
}

/** Mounted once (by HeaderBar's Overlays). */
export function ContextMenuHost() {
  const menu = useMenu((s) => s.menu), box = useRef<HTMLDivElement>(null), [active, setActiveState] = useState(-1), activeRef = useRef(-1)
  const setActive = (n: number) => { activeRef.current = n; setActiveState(n) }
  useLayoutEffect(() => {
    const el = box.current; if (!menu || !el) return
    const w = el.offsetWidth, h = el.offsetHeight, flipX = menu.x + w > window.innerWidth - 8, flipY = menu.y + h > window.innerHeight - 8
    el.style.left = `${Math.max(8, flipX ? menu.x - w : menu.x)}px`; el.style.top = `${Math.max(8, flipY ? menu.y - h : menu.y)}px`
    el.style.transformOrigin = `${flipX ? 'right' : 'left'} ${flipY ? 'bottom' : 'top'}`
  }, [menu])
  useEffect(() => { activeRef.current = -1; setActiveState(-1) }, [menu])
  useEffect(() => {
    if (!menu) return
    const usable = menu.items.map((i, n) => (i.sep || i.disabled ? -1 : n)).filter((n) => n >= 0)
    const run = (i: MenuItem) => { close(); i.run?.() }
    const down = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) close() }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        const at = usable.indexOf(activeRef.current), d = e.key === 'ArrowDown' ? 1 : -1
        setActive(at < 0 ? (d > 0 ? usable[0] : usable[usable.length - 1]) : usable[(at + d + usable.length) % usable.length])
      } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); const it = menu.items[activeRef.current]; if (it) run(it) }
    }
    window.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true)
    window.addEventListener('blur', close); window.addEventListener('resize', close); window.addEventListener('wheel', close, { passive: true })
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); window.removeEventListener('blur', close); window.removeEventListener('resize', close); window.removeEventListener('wheel', close) }
  }, [menu])
  if (!menu) return null
  return createPortal(
    <div ref={box} className="ed-pop ed-cm" role="menu" onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((it, n) => it.sep ? <div key={n} className="ed-cm-sep" /> : (
        <button key={n} role="menuitem" disabled={it.disabled} className={`ed-cm-item ${active === n ? 'active' : ''} ${it.danger ? 'danger' : ''}`}
          onMouseEnter={() => !it.disabled && setActive(n)} onClick={() => { close(); it.run?.() }}>
          <span className="ed-cm-check">{it.checked ? '✓' : ''}</span><span className="ed-cm-label">{it.label}</span><span className="ed-cm-keys mono">{it.keys ? formatKey(it.keys) : ''}</span>
        </button>
      ))}
    </div>, document.body)
}

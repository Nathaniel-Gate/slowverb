import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useOverlay } from '../overlayStore'

/** Anchored dropdown. Portalled to <body> so no animated ancestor can clip or re-stack it. Closes on outside press / Escape.
 *  While open it counts as an overlay, so editor shortcuts stand down (Space does not play under a menu). */
export function Popover({ anchor, open, onClose, align = 'left', className = '', children }:
  { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; align?: 'left' | 'right'; className?: string; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current, a = anchor.current; if (!open || !el || !a) return
    const r = a.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight
    const left = Math.min(Math.max(8, align === 'right' ? r.right - w : r.left), window.innerWidth - w - 8)
    const below = r.bottom + 6 + h <= window.innerHeight - 8
    el.style.left = `${left}px`; el.style.top = `${below ? r.bottom + 6 : Math.max(8, r.top - 6 - h)}px`
    el.style.transformOrigin = `${align === 'right' ? 'right' : 'left'} ${below ? 'top' : 'bottom'}`
  })
  useEffect(() => {
    if (!open) return
    useOverlay.getState().set({ menu: true })
    const down = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !anchor.current?.contains(t)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); onClose() } }
    window.addEventListener('pointerdown', down, true); window.addEventListener('keydown', key, true)
    return () => { window.removeEventListener('pointerdown', down, true); window.removeEventListener('keydown', key, true); useOverlay.getState().set({ menu: false }) }
  }, [open, onClose, anchor])
  if (!open) return null
  return createPortal(<div ref={box} className={`ed-pop ${className}`} role="menu">{children}</div>, document.body)
}

import type { RefObject } from 'react'

// A little text bubble that follows the pointer (drag values, hover tooltip). Written straight to the DOM.
export function showHud(ref: RefObject<HTMLDivElement | null>, root: HTMLElement | null, text: string, cx: number, cy: number) {
  const el = ref.current
  if (!el || !root) return
  const r = root.getBoundingClientRect()
  if (el.textContent !== text) el.textContent = text
  const w = el.offsetWidth, x = Math.min(cx - r.left + 14, r.width - w - 6)
  el.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, cy - r.top + 18)}px)`
  el.dataset.on = ''
}
export function hideHud(ref: RefObject<HTMLDivElement | null>) { delete ref.current?.dataset.on }

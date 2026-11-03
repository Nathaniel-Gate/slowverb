import { useLayoutEffect, useRef } from 'react'
/** Rows glide to their new place instead of jumping (same idea as Forge's list motion: measure before/after,
 *  play the difference with transform only). Mark rows with data-flip="<stable id>". New rows are left to CSS. */
export function useFlip<T extends HTMLElement>() {
  const ref = useRef<T>(null), prev = useRef(new Map<string, number>())
  useLayoutEffect(() => {
    const root = ref.current; if (!root) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const next = new Map<string, number>()
    root.querySelectorAll<HTMLElement>('[data-flip]').forEach((el) => {
      const id = el.dataset.flip!, top = el.offsetTop; next.set(id, top)
      const was = prev.current.get(id)
      if (!reduced && was !== undefined && Math.abs(was - top) > 1) {
        el.animate([{ transform: `translateY(${was - top}px)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.16,1,.3,1)' })
      }
    })
    prev.current = next
  })
  return ref
}

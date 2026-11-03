import { useLayoutEffect, type DependencyList, type RefObject } from 'react'

/** Slides a highlight element to the row marked data-sel="1" inside `box` (same idea as PlaylistTree). Transform + height only. */
export function useSlidePill(box: RefObject<HTMLElement | null>, pill: RefObject<HTMLElement | null>, deps: DependencyList) {
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-sel="1"]'), p = pill.current; if (!p) return
    if (!el) { p.style.opacity = '0'; return }
    p.style.opacity = '1'; p.style.height = el.offsetHeight + 'px'; p.style.transform = `translateY(${el.offsetTop}px)`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

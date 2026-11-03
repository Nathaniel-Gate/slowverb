import type { RefObject } from 'react'
import type { Project } from '../model'

// The small bridge between Timeline.tsx (which owns the view state) and the input hooks.
export type Marquee = { t0: number; y0: number; t1: number; y1: number } // times + content y, so autoscroll keeps the anchor
export type Guides = {                                                    // DOM nodes moved directly (no React per pointer move)
  razor: RefObject<HTMLDivElement | null>; hot: RefObject<HTMLDivElement | null>
  ghost: RefObject<HTMLDivElement | null>; hud: RefObject<HTMLDivElement | null>
}
export type TimelineUi = {
  setPreview: (p: Project | null) => void
  setSnapAt: (t: number | null) => void
  setMarquee: (m: Marquee | null) => void
  setRange: (r: { in: number; out: number } | null) => void
  flash: (t: number, y: number, h: number) => void
}

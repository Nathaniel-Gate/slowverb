// Plain single-shape line icons (24px box, currentColor).
type P = { size?: number }
const base = (size = 24) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true })
export const Play = ({ size }: P) => <svg {...base(size)} fill="currentColor" stroke="none"><path d="M7 4.5v15l12-7.5z" /></svg>
export const Pause = ({ size }: P) => <svg {...base(size)} fill="currentColor" stroke="none"><rect x="6" y="4.5" width="4" height="15" rx="1" /><rect x="14" y="4.5" width="4" height="15" rx="1" /></svg>
export const Prev = ({ size }: P) => <svg {...base(size)} fill="currentColor" stroke="none"><rect x="5" y="5" width="2.4" height="14" rx="1" /><path d="M19 5v14L9 12z" /></svg>
export const Next = ({ size }: P) => <svg {...base(size)} fill="currentColor" stroke="none"><rect x="16.6" y="5" width="2.4" height="14" rx="1" /><path d="M5 5v14l10-7z" /></svg>
export const Down = ({ size }: P) => <svg {...base(size)}><path d="M6 9l6 6 6-6" /></svg>
export const Plus = ({ size }: P) => <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
export const Lib = ({ size }: P) => <svg {...base(size)}><path d="M5 5v14M10 5v14M15 6l4 13" /></svg>
export const Gear = ({ size }: P) => <svg {...base(size)}><path d="M4 8h10M18 8h2M4 16h2M10 16h10" /><circle cx="16" cy="8" r="2" /><circle cx="8" cy="16" r="2" /></svg>
export const Wave = ({ size }: P) => <svg {...base(size)}><path d="M4 12v0M8 8v8M12 5v14M16 9v6M20 12v0" /></svg>
export function Skip({ dir, secs, size = 26 }: { dir: -1 | 1; secs: number; size?: number }) {
  return (
    <svg {...base(size)} viewBox="0 0 28 28">
      <path d={dir < 0 ? 'M14 5a9 9 0 1 1-9 9M14 5l-3.5-3M14 5l-3.5 3' : 'M14 5a9 9 0 1 0 9 9M14 5l3.5-3M14 5l3.5 3'} />
      <text x="14" y="18" textAnchor="middle" fontSize="8" fontFamily="var(--font-mono)" fill="currentColor" stroke="none">{secs}</text>
    </svg>
  )
}
export const Eq = ({ paused }: { paused?: boolean }) => <span className={`eq ${paused ? 'paused' : ''}`}><i /><i /><i /></span>

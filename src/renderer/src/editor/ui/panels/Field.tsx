import { useState } from 'react'

type Props = {
  value: number | null          // null = mixed (several clips disagree)
  fmt(v: number): string; parse(s: string): number | null
  onCommit?(v: number): void
  step?: number; disabled?: boolean; label?: string; title?: string
}

/** Click-to-type number box. Enter or blur commits, Escape reverts, Up/Down step (Shift x10). Bad text reverts silently. */
export function Field({ value, fmt, parse, onCommit, step, disabled, label, title }: Props) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? (value === null ? '' : fmt(value))
  const done = (text: string) => { setDraft(null); const v = parse(text); if (v !== null && Number.isFinite(v) && (value === null || fmt(v) !== fmt(value))) onCommit?.(v) }
  return (
    <label className={`dk-field ${disabled ? 'off' : ''}`} title={title}>
      {label && <span className="mono">{label}</span>}
      <input className="dk-input" value={shown} disabled={disabled} placeholder={value === null ? 'mixed' : ''} spellCheck={false}
        onFocus={(e) => e.currentTarget.select()} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => draft !== null && done(e.currentTarget.value)}
        onKeyDown={(e) => {
          e.stopPropagation()   // typing must never reach the editor shortcuts
          if (e.key === 'Enter') { done(e.currentTarget.value); e.currentTarget.blur() }
          else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
          else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && step && value !== null) {
            e.preventDefault(); onCommit?.(value + (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1)); setDraft(null)
          }
        }} />
    </label>
  )
}

/** Free text (names). Same commit rules. */
export function TextField({ value, onCommit, placeholder, disabled }: { value: string | null; onCommit(v: string): void; placeholder?: string; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null)
  const done = (t: string) => { setDraft(null); if (t !== (value ?? '')) onCommit(t) }
  return (
    <input className="dk-input dk-text" value={draft ?? value ?? ''} disabled={disabled} placeholder={value === null ? 'mixed' : placeholder} spellCheck={false}
      onFocus={(e) => e.currentTarget.select()} onChange={(e) => setDraft(e.target.value)} onBlur={(e) => draft !== null && done(e.currentTarget.value)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { done(e.currentTarget.value); e.currentTarget.blur() } else if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() } }} />
  )
}

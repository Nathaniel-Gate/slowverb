// Key strings ('Cmd+Shift+K') <-> KeyboardEvent.code combos. Pure.
export type Combo = { code: string; meta: boolean; shift: boolean; alt: boolean }

const NAMED: Record<string, string> = { Left: 'ArrowLeft', Right: 'ArrowRight', Up: 'ArrowUp', Down: 'ArrowDown' }
const LITERAL: Record<string, string> = { ';': 'Semicolon', "'": 'Quote', '\\': 'Backslash', '=': 'Equal', '-': 'Minus', ',': 'Comma', '.': 'Period', '/': 'Slash', '[': 'BracketLeft', ']': 'BracketRight', '`': 'Backquote' }
const BACK = new Map<string, string>([...Object.entries(NAMED), ...Object.entries(LITERAL)].map(([k, v]) => [v, k]))
const MODS = /^(Shift|Meta|Alt|Control|OS)(Left|Right)$/
const GLYPH: Record<string, string> = { Cmd: '⌘', Shift: '⇧', Alt: '⌥', Left: '←', Right: '→', Up: '↑', Down: '↓', Delete: '⌦', Backspace: '⌫', Escape: 'Esc', Space: 'Space', NumpadAdd: 'Num+', NumpadSubtract: 'Num-' }

const tokenCode = (t: string): string =>
  /^[a-z]$/i.test(t) ? `Key${t.toUpperCase()}` : /^\d$/.test(t) ? `Digit${t}` : NAMED[t] ?? LITERAL[t] ?? t

export function parseKey(s: string): Combo | null {
  const parts = s.split('+').filter(Boolean); if (!parts.length) return null
  const key = parts[parts.length - 1], mods = new Set(parts.slice(0, -1))
  return { code: tokenCode(key), meta: mods.has('Cmd'), shift: mods.has('Shift'), alt: mods.has('Alt') }
}
export const comboId = (c: Combo) => `${c.meta ? 'M' : ''}${c.shift ? 'S' : ''}${c.alt ? 'A' : ''}|${c.code}`
export const keyId = (s: string): string | null => { const c = parseKey(s); return c ? comboId(c) : null }
export const eventCombo = (e: KeyboardEvent): Combo => ({ code: e.code, meta: e.metaKey, shift: e.shiftKey, alt: e.altKey })

/** KeyboardEvent -> key string, or null for a bare modifier press. */
export function keyFromEvent(e: KeyboardEvent): string | null {
  if (MODS.test(e.code) || !e.code) return null
  const c = e.code, tok = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : BACK.get(c) ?? c
  return [e.metaKey && 'Cmd', e.shiftKey && 'Shift', e.altKey && 'Alt', tok].filter(Boolean).join('+')
}

/** 'Cmd+Shift+K' -> a mac-style glyph string. */
export function formatKey(s: string): string {
  const parts = s.split('+').filter(Boolean)
  return parts.map((p) => GLYPH[p] ?? p).join(parts.some((p) => p.length > 1 && !GLYPH[p]) ? ' ' : '')
}

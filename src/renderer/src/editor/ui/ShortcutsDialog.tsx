import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { COMMANDS, collisions, isCustom, keysOf, useKeymap, type Command } from '../commands'
import { formatKey, keyFromEvent, keyId } from '../keyparse'
import { useOverlay } from '../overlayStore'

type Cap = { id: string; at: number | null }                 // which command, and which key slot is being replaced (null = add)
type Pending = { id: string; at: number | null; key: string; clash: Command[] }

export function ShortcutsDialog() {
  const open = useOverlay((s) => s.shortcuts)
  return open ? createPortal(<Dialog />, document.body) : null
}

function Dialog() {
  const overrides = useKeymap((s) => s.overrides), { setKeys, reset, resetAll } = useKeymap.getState()
  const [q, setQ] = useState(''), [cap, setCap] = useState<Cap | null>(null), [pending, setPending] = useState<Pending | null>(null)
  const close = () => useOverlay.getState().set({ shortcuts: false, capturing: false })
  const commit = (id: string, at: number | null, key: string) => {
    const cur = keysOf(id, overrides), next = at === null ? [...cur.filter((k) => k !== key), key] : cur.map((k, i) => (i === at ? key : k))
    setKeys(id, next)
  }
  useEffect(() => {
    useOverlay.getState().set({ capturing: !!cap })
    if (!cap) return
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault(); e.stopPropagation()
      if (e.key === 'Escape') { setCap(null); return }
      const key = keyFromEvent(e); if (!key) return
      const clash = collisions(key, cap.id)
      if (clash.length) setPending({ id: cap.id, at: cap.at, key, clash }); else commit(cap.id, cap.at, key)
      setCap(null)
    }
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true)
  }, [cap])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (cap) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement && e.target.value)) { e.preventDefault(); e.stopPropagation(); pending ? setPending(null) : close() } }
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true)
  }, [cap, pending])
  useEffect(() => () => useOverlay.getState().set({ capturing: false }), [])

  const reassign = () => {
    if (!pending) return
    const { id, at, key, clash } = pending
    for (const c of clash) setKeys(c.id, keysOf(c.id, overrides).filter((k) => !sameKey(k, key)))
    commit(id, at, key); setPending(null)
  }
  const groups = useMemo(() => {
    const t = q.trim().toLowerCase(), by = new Map<string, Command[]>()
    for (const c of COMMANDS) if (!t || c.label.toLowerCase().includes(t) || c.group.toLowerCase().includes(t) || keysOf(c.id, overrides).some((k) => formatKey(k).toLowerCase().includes(t))) by.set(c.group, [...(by.get(c.group) ?? []), c])
    return [...by]
  }, [q, overrides])
  const anyClash = (c: Command) => keysOf(c.id, overrides).some((k) => collisions(k, c.id).length > 0)

  return (
    <div className="ed-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget && !cap) close() }}>
      <div className="ed-dialog" role="dialog" aria-label="Keyboard shortcuts">
        <div className="ed-legend mono">⌘ COMMAND · ⌥ OPTION · ⇧ SHIFT (the up-arrow symbol) · ⌃ CONTROL</div>
        <div className="ed-dialog-head">
          <span className="ed-dialog-title">Keyboard shortcuts</span>
          <input className="ed-dialog-search" autoFocus placeholder="Filter" spellCheck={false} value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="ghost" onClick={resetAll} title="Restore every default">RESET ALL</button>
          <button className="ghost" onClick={close} title="Close (Esc)">CLOSE</button>
        </div>
        {pending && (
          <div className="ed-warn">
            <span>{formatKey(pending.key)} is already used by {pending.clash.map((c) => c.label).join(', ')}.</span>
            <button className="ghost" onClick={reassign}>REASSIGN</button><button className="ghost" onClick={() => setPending(null)}>CANCEL</button>
          </div>
        )}
        <div className="ed-dialog-body">
          {groups.map(([g, cs]) => (
            <section key={g}>
              <h4 className="mono">{g}</h4>
              {cs.map((c) => {
                const ks = keysOf(c.id, overrides), capHere = cap?.id === c.id
                return (
                  <div key={c.id} className={`ed-sc-row ${anyClash(c) ? 'clash' : ''}`}>
                    <span className="ed-sc-label">{c.label}{anyClash(c) && <i className="ed-sc-warn" title="Shares a key with another command">!</i>}</span>
                    <span className="ed-sc-keys">
                      {ks.map((k, i) => (
                        <span key={k} className={`ed-chip mono ${capHere && cap?.at === i ? 'listening' : ''}`}>
                          <button title="Click, then press the new key" onClick={() => setCap({ id: c.id, at: i })}>{capHere && cap?.at === i ? 'Press keys' : formatKey(k)}</button>
                          <button className="x" title="Clear this key" onClick={() => setKeys(c.id, ks.filter((_, j) => j !== i))}>&times;</button>
                        </span>
                      ))}
                      {capHere && cap?.at === null
                        ? <span className="ed-chip mono listening"><button>Press keys</button></span>
                        : <button className="ed-chip add mono" title="Add a shortcut" onClick={() => setCap({ id: c.id, at: null })}>+</button>}
                      {!ks.length && !capHere && <span className="ed-sc-none mono">none</span>}
                    </span>
                    <button className="ghost ed-sc-reset" disabled={!isCustom(c.id, overrides)} onClick={() => reset(c.id)}>RESET</button>
                  </div>
                )
              })}
            </section>
          ))}
        </div>
        <div className="ed-dialog-foot mono">Click a key to change it, + to add another. Changes apply instantly and are remembered.</div>
      </div>
    </div>
  )
}

const sameKey = (a: string, b: string) => keyId(a) === keyId(b)

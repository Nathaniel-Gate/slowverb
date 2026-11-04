import { useState } from 'react'
import { useLists } from '../state/lists.store'
import { useNav } from '../state/nav.store'

/** Bottom sheet for a playlist: name a new one, or rename / delete an existing one (delete asks twice; songs always stay). */
export function ListSheet({ id, category, onClose, onCreated }: { id: string | null; category: string; onClose(): void; onCreated(id: string): void }) {
  const list = useLists((s) => s.lists.find((l) => l.id === id))
  const { rename, remove, create } = useLists()
  const openList = useNav((s) => s.openList)
  const [name, setName] = useState(list?.name ?? '')
  const [sure, setSure] = useState(false)
  const save = () => {
    const n = name.trim(); if (!n) return
    if (id) rename(id, n); else onCreated(create(n, category))
    onClose()
  }
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Playlist options" onClick={(e) => e.stopPropagation()}>
        <span className="mono">{id ? 'PLAYLIST' : `NEW ${category.toUpperCase()} PLAYLIST`}</span>
        <label className="field"><span className="mono">NAME</span>
          <input autoFocus value={name} placeholder="Playlist name" maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} enterKeyHint="done" /></label>
        <div className="sheet-row"><button className="btn" onClick={onClose}>CANCEL</button><button className="btn solid" onClick={save} disabled={!name.trim()}>{id ? 'SAVE' : 'CREATE'}</button></div>
        {id && <button className={`btn wide ${sure ? 'solid' : ''}`} style={{ marginTop: 8 }} onClick={() => { if (sure) { remove(id); openList(null); onClose() } else setSure(true) }}>{sure ? 'TAP AGAIN: DELETE (SONGS STAY)' : 'DELETE PLAYLIST'}</button>}
      </div>
    </div>
  )
}

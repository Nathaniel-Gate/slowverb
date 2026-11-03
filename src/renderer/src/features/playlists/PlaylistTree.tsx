import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLibrary } from '../library/library.store'
import { CATEGORIES } from '../../../../shared/config'
import { Seg } from '../lists/Seg'
import { usePlaylists, relOf } from './playlists.store'

type Row = { rel: string | null; label: string; depth: number }
const base = (rel: string) => rel.slice(rel.lastIndexOf('/') + 1)

/** FILES view: the folder tree = where each song lives (Songs, Sound bites, sub-folders). Sliding highlight (idea from Forge's slide-pill), drop targets, inline new/rename, right-click menu. */
export function PlaylistTree() {
  const { root, folders, sel, select, create, rename, trash, moveTrack, importFiles } = usePlaylists()
  const tracks = useLibrary((s) => s.tracks)
  const [editing, setEditing] = useState<{ kind: 'new'; parent: string } | { kind: 'rename'; rel: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; rel: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null), pill = useRef<HTMLDivElement>(null)

  const counts = new Map<string | null, number>([[null, tracks.length]])
  for (const t of tracks) { const r = relOf(root, t.path); if (r !== null) counts.set(r, (counts.get(r) ?? 0) + 1) }
  const rows: Row[] = [{ rel: null, label: 'All songs', depth: 0 }, ...(counts.get('') ? [{ rel: '', label: 'Unsorted', depth: 0 } as Row] : []),
    ...folders.map((f) => ({ rel: f, label: base(f), depth: f.split('/').length - 1 }))]

  // slide the highlight to the selected row
  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-sel="1"]'), p = pill.current; if (!p) return
    if (!el) { p.style.opacity = '0'; return }
    p.style.opacity = '1'; p.style.height = el.offsetHeight + 'px'; p.style.transform = `translateY(${el.offsetTop}px)`
  }, [sel, folders, tracks.length, editing])
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  const drop = async (e: React.DragEvent, rel: string | null) => {
    e.preventDefault(); e.stopPropagation(); setOver(null)
    const id = e.dataTransfer.getData('application/x-slowverb-track')
    if (id) { if (rel !== null) await moveTrack(id, rel); return }
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathFor(f)).filter(Boolean)
    if (paths.length) await importFiles(paths, rel ?? '')
  }
  const input = (initial: string, onDone: (v: string) => void) => (
    <input autoFocus className="pl-input" defaultValue={initial} placeholder="Folder name" spellCheck={false}
      onBlur={() => setEditing(null)} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); if (e.key === 'Enter') { onDone(e.currentTarget.value); setEditing(null) } }} />
  )
  return (
    <div className="pl">
      <div className="side-head row"><Seg /><button className="ghost" title="New folder" onClick={() => setEditing({ kind: 'new', parent: sel && sel !== '' ? sel : '' })}>+ FOLDER</button></div>
      <div className="pl-list" ref={box}>
        <div className="pl-pill" ref={pill} />
        {rows.map((r) => {
          const key = r.rel ?? '*', isSel = sel === r.rel
          return editing?.kind === 'rename' && editing.rel === r.rel
            ? <div key={key} className="pl-row" style={{ paddingLeft: 14 + r.depth * 16 }}>{input(r.label, (v) => rename(r.rel!, v))}</div>
            : (
              <div key={key} data-sel={isSel ? 1 : 0} className={`pl-row ${isSel ? 'on' : ''} ${over === key ? 'over' : ''}`} style={{ paddingLeft: 14 + r.depth * 16 }}
                onClick={() => select(r.rel)} onContextMenu={(e) => { e.preventDefault(); if (r.rel) setMenu({ x: e.clientX, y: e.clientY, rel: r.rel }) }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(key) }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, r.rel)}>
                <span className="pl-name">{r.label}</span>
                <span className="n">{counts.get(r.rel) ?? 0}</span>
              </div>
            )
        })}
        {editing?.kind === 'new' && <div className="pl-row" style={{ paddingLeft: 14 + (editing.parent ? editing.parent.split('/').length : 0) * 16 }}>{input('', (v) => create(editing.parent, v))}</div>}
      </div>
      {menu && createPortal(
        <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditing({ kind: 'new', parent: menu.rel }); setMenu(null) }}>New folder inside</button>
          {!(CATEGORIES as readonly string[]).includes(menu.rel) && <>
            <button onClick={() => { setEditing({ kind: 'rename', rel: menu.rel }); setMenu(null) }}>Rename</button>
            <button className="danger" onClick={() => { trash(menu.rel); setMenu(null) }}>Move to Trash</button></>}
        </div>, document.body)}
    </div>
  )
}

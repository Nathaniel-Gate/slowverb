import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLibrary } from '../library/library.store'
import { fileRel, usePlaylists } from '../playlists/playlists.store'
import { Seg } from './Seg'
import { CATEGORIES } from '../../../../shared/config'
import { catOfList, useLists } from './lists.store'
import { placeFiles } from './place'

const TRACK_MIME = 'application/x-slowverb-track'

/** PLAYLISTS view: virtual lists. Drop a song on one to add it (the file never moves); right-click to rename or delete the list. */
export function ListsPane() {
  const { lists, listSel, selectList, create, rename, remove, add } = useLists()
  const tracks = useLibrary((s) => s.tracks), root = usePlaylists((s) => s.root)
  const [editing, setEditing] = useState<{ kind: 'new'; cat: string } | { kind: 'rename'; id: string } | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null), pill = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = box.current?.querySelector<HTMLElement>('[data-sel="1"]'), p = pill.current; if (!p) return
    if (!el) { p.style.opacity = '0'; return }
    p.style.opacity = '1'; p.style.height = el.offsetHeight + 'px'; p.style.transform = `translateY(${el.offsetTop}px)`
  }, [listSel, lists, editing])
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  const count = (songs: string[]) => { const have = new Set(tracks.map((t) => fileRel(root, t.path))); return songs.filter((s) => have.has(s)).length }
  const drop = async (e: React.DragEvent, id: string) => {
    e.preventDefault(); e.stopPropagation(); setOver(null)
    const tid = e.dataTransfer.getData(TRACK_MIME)
    if (tid) { const t = tracks.find((x) => x.id === tid), r = t && fileRel(root, t.path); if (r) add([id], [r]); return }
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathFor(f)).filter(Boolean)
    if (paths.length) await placeFiles(paths, `${paths.length} file${paths.length === 1 ? '' : 's'}`, [id])
  }
  const input = (initial: string, onDone: (v: string) => void) => (
    <input autoFocus className="pl-input" defaultValue={initial} placeholder="Playlist name" spellCheck={false}
      onBlur={() => setEditing(null)} onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => { if (e.key === 'Escape') setEditing(null); if (e.key === 'Enter') { onDone(e.currentTarget.value); setEditing(null) } }} />
  )
  return (
    <div className="pl">
      <div className="side-head row"><Seg /></div>
      <div className="pl-list" ref={box}>
        <div className="pl-pill" ref={pill} />
        <div data-sel={listSel === null ? 1 : 0} className={`pl-row ${listSel === null ? 'on' : ''}`} onClick={() => selectList(null)}><span className="pl-name">All songs</span><span className="n">{tracks.length}</span></div>
        {CATEGORIES.map((c) => (
          <div key={c} className="pl-sec">
            <div className="pl-sechead"><span className="mono">{c.toUpperCase()}</span><button className="ghost" title={`New ${c} playlist`} onClick={() => setEditing({ kind: 'new', cat: c })}>+ NEW</button></div>
        {lists.filter((l) => catOfList(l) === c).map((l) => editing?.kind === 'rename' && editing.id === l.id
            ? <div key={l.id} className="pl-row">{input(l.name, (v) => rename(l.id, v))}</div>
            : (
              <div key={l.id} data-sel={listSel === l.id ? 1 : 0} className={`pl-row ${listSel === l.id ? 'on' : ''} ${over === l.id ? 'over' : ''}`}
                onClick={() => selectList(l.id)} onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, id: l.id }) }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(l.id) }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, l.id)}>
                <span className="pl-name">{l.name}</span><span className="n">{count(l.songs)}</span>
              </div>
            ))}
          {editing?.kind === 'new' && editing.cat === c && <div className="pl-row">{input('', (v) => { if (v.trim()) selectList(create(v, c)) })}</div>}
          {!lists.some((l) => catOfList(l) === c) && !(editing?.kind === 'new' && editing.cat === c) && <div className="pl-hint mono">No {c} playlists yet.</div>}
          </div>
        ))}
      </div>
      {menu && createPortal(
        <div className="menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setEditing({ kind: 'rename', id: menu.id }); setMenu(null) }}>Rename</button>
          <button className="danger" onClick={() => { remove(menu.id); setMenu(null) }}>Delete playlist (songs stay)</button>
        </div>, document.body)}
    </div>
  )
}

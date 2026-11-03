import { useEffect, useRef, useState } from 'react'
import { CATEGORIES } from '../../../../shared/config'
import { useAddPopup } from './addPopup.store'
import { useLists } from './lists.store'

/** "Where does this go?" Asked on every drop/import/download: the song's ONE home (Songs or Sound bites) + any playlists to join. Enter adds, Esc cancels. */
export function AddPopup() {
  const req = useAddPopup((s) => s.req), close = useAddPopup((s) => s.close), lists = useLists((s) => s.lists)
  const [cat, setCat] = useState<string>(CATEGORIES[0]), [pick, setPick] = useState<string[]>([]), [name, setName] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (req) { setCat(req.category); setPick(req.preLists); setName(''); requestAnimationFrame(() => box.current?.focus()) } }, [req])
  if (!req) return null
  const ok = () => close({ category: cat, listIds: pick, newList: name })
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(null) }
    else if (e.key === 'Enter') { e.preventDefault(); ok() }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target === box.current) setCat(CATEGORIES[(CATEGORIES.indexOf(cat as never) + 1) % CATEGORIES.length])
  }
  return (
    <div className="ap-scrim" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className="ap" ref={box} tabIndex={-1} onKeyDown={key} role="dialog" aria-label="Where does this go?">
        <div className="ap-title">Where does this go?</div>
        <div className="ap-what mono">{req.what}</div>
        <div className="ap-cats" data-i={Math.max(0, CATEGORIES.indexOf(cat as never))}>
          <i className="ap-pill" />
          {CATEGORIES.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="ap-sub mono">ALSO ADD TO PLAYLISTS <span>optional</span></div>
        <div className="ap-lists">
          {lists.map((l) => (
            <button key={l.id} className={`ap-list ${pick.includes(l.id) ? 'on' : ''}`} role="checkbox" aria-checked={pick.includes(l.id)}
              onClick={() => setPick(pick.includes(l.id) ? pick.filter((x) => x !== l.id) : [...pick, l.id])}>
              <span className="ap-box"><i /></span><span className="ap-nm">{l.name}</span>
            </button>
          ))}
          <input className="ap-new" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ New playlist" spellCheck={false} />
        </div>
        <div className="ap-foot"><button className="ghost" onClick={() => close(null)}>CANCEL</button><button className="ap-go" onClick={ok}>ADD</button></div>
      </div>
    </div>
  )
}

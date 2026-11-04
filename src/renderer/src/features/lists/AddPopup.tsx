import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, MISC_ARTIST } from '../../../../shared/config'
import { useLibrary } from '../library/library.store'
import { artistCounts } from './artists'
import { useAddPopup } from './addPopup.store'
import { catOfList, useLists } from './lists.store'

/** "Where does this go?" Asked on every drop/import/download: the song's ONE home (Songs or Sound bites) + any playlists to join. Enter adds, Esc cancels. */
export function AddPopup() {
  const req = useAddPopup((s) => s.req), close = useAddPopup((s) => s.close), lists = useLists((s) => s.lists)
  const [cat, setCat] = useState<string>(CATEGORIES[0]), [pick, setPick] = useState<string[]>([]), [name, setName] = useState('')
  const [artist, setArtist] = useState<string | null>(null), [aq, setAq] = useState('')   // artist is always asked: pick one that exists, make a new one, or Misc
  const tracks = useLibrary((s) => s.tracks)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { if (req) { setCat(req.category); setPick(req.preLists); setName(''); setArtist(null); setAq(''); requestAnimationFrame(() => box.current?.focus()) } }, [req])
  if (!req) return null
  const typed = aq.trim(), known = artistCounts(tracks).filter((a) => a.name !== MISC_ARTIST)
  const matches = known.filter((a) => a.name.toLowerCase().includes(typed.toLowerCase()))
  const canNew = !!typed && typed.toLowerCase() !== MISC_ARTIST.toLowerCase() && !known.some((a) => a.name.toLowerCase() === typed.toLowerCase())
  const ok = () => artist && close({ category: cat, artist, listIds: pick.filter((id) => lists.some((l) => l.id === id && catOfList(l) === cat)), newList: name })
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(null) }
    else if (e.key === 'Enter') {
      e.preventDefault()
      if (e.target instanceof HTMLInputElement && e.target.dataset.artist) { const pickOne = matches.length === 1 && !canNew ? matches[0].name : canNew ? typed : null; if (pickOne) { setArtist(pickOne); setAq('') } }   // Enter in the artist box picks the only match / the new name
      else ok()
    }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.target === box.current) setCat(CATEGORIES[(CATEGORIES.indexOf(cat as never) + 1) % CATEGORIES.length])
  }
  return (
    <div className="ap-scrim" onMouseDown={(e) => e.target === e.currentTarget && close(null)}>
      <div className="ap" ref={box} tabIndex={-1} onKeyDown={key} role="dialog" aria-label="Where does this go?">
        <div className="ap-title">Where does this go?</div>
        <div className="ap-what mono">{req.what}</div>
        <div className="ap-cats" style={{ '--n': CATEGORIES.length } as React.CSSProperties} data-i={Math.max(0, CATEGORIES.indexOf(cat as never))}>
          <i className="ap-pill" />
          {CATEGORIES.map((c) => <button key={c} className={c === cat ? 'on' : ''} onClick={() => setCat(c)}>{c}</button>)}
        </div>
        <div className="ap-sub mono">ARTIST {artist && <span className="ap-chosen">{artist}</span>}</div>
        <div className="ap-artist">
          <input className="ap-new ap-q" data-artist="1" value={aq} onChange={(e) => setAq(e.target.value)} placeholder="Search artists, or type a new one" spellCheck={false} />
          <div className="ap-lists ap-alist">
            <button className={`ap-list ${artist === MISC_ARTIST ? 'on' : ''}`} onClick={() => setArtist(MISC_ARTIST)}><span className="ap-dot on-dot" /><span className="ap-nm">Misc</span><span className="ap-n mono">no artist</span></button>
            {canNew && <button className={`ap-list ${artist === typed ? 'on' : ''}`} onClick={() => { setArtist(typed); setAq('') }}><span className="ap-dot on-dot" /><span className="ap-nm">+ New artist “{typed}”</span></button>}
            {matches.map((a) => <button key={a.name} className={`ap-list ${artist === a.name ? 'on' : ''}`} onClick={() => { setArtist(a.name); setAq('') }}><span className="ap-dot on-dot" /><span className="ap-nm">{a.name}</span><span className="ap-n mono">{a.n}</span></button>)}
          </div>
        </div>
        <div className="ap-sub mono">ALSO ADD TO {cat.toUpperCase()} PLAYLISTS <span>optional</span></div>
        <div className="ap-lists">
          {lists.filter((l) => catOfList(l) === cat).map((l) => (
            <button key={l.id} className={`ap-list ${pick.includes(l.id) ? 'on' : ''}`} role="checkbox" aria-checked={pick.includes(l.id)}
              onClick={() => setPick(pick.includes(l.id) ? pick.filter((x) => x !== l.id) : [...pick, l.id])}>
              <span className="ap-box"><i /></span><span className="ap-nm">{l.name}</span>
            </button>
          ))}
          <input className="ap-new" value={name} onChange={(e) => setName(e.target.value)} placeholder="+ New playlist" spellCheck={false} />
        </div>
        <div className="ap-foot"><button className="ghost" onClick={() => close(null)}>CANCEL</button><button className="ap-go" disabled={!artist} title={artist ? '' : 'Choose an artist, a new artist, or Misc'} onClick={ok}>ADD</button></div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { catOf, songRel } from '../state/model'
import type { Song } from './types'

/** Bottom sheet to choose what a layer plays: a song from the phone library (White noise and Sound bites first) or a whole playlist. */
export function LayerPicker({ songs, lists, order, hide, onPick, onClose }: {
  songs: Song[]; lists: { id: string; name: string; rels: string[] }[]; order: string[]; hide: string[]; onPick(rels: string[]): void; onClose(): void
}) {
  const [q, setQ] = useState('')
  const rank = (s: Song) => order.indexOf(catOf(s))
  const rest = songs.filter((s) => !hide.includes(songRel(s)) && s.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title))
  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet picker" role="dialog" aria-label="Choose layer" onClick={(e) => e.stopPropagation()}>
        <span className="mono">ADD TO LAYER</span>
        <input className="picker-search" value={q} placeholder="Search your library" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
        <div className="picker-list">
          {!q && lists.map((l) => <button key={l.id} className="picker-row" onClick={() => onPick(l.rels)}><span className="t">Playlist: {l.name}</span><span className="mono">{l.rels.length} {l.rels.length === 1 ? 'song' : 'songs'}</span></button>)}
          {rest.length === 0 && <p className="set-note">Nothing to add. Import sounds into White noise or Sound bites first.</p>}
          {rest.slice(0, 60).map((s) => <button key={s.id} className="picker-row" onClick={() => onPick([songRel(s)])}><span className="t">{s.title}</span><span className="mono">{catOf(s)}</span></button>)}
        </div>
        <button className="btn wide ghost-btn" onClick={onClose}>CANCEL</button>
      </div>
    </div>
  )
}

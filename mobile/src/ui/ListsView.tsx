import { useState } from 'react'
import { useLibrary } from '../state/library.store'
import { useLists } from '../state/lists.store'
import { countInList, listsIn } from '../state/model'
import { useNav } from '../state/nav.store'
import { ListSheet } from './ListSheet'
import { Plus } from './icons'

/** PLAYLISTS of the current category, like the Mac's PLAYLISTS view: name + song count; tap opens the list, hold (or the dots) renames / deletes. */
export function ListsView() {
  const { category, openList } = useNav()
  const lists = useLists((s) => s.lists), songs = useLibrary((s) => s.songs)
  const [sheet, setSheet] = useState<{ id: string } | 'new' | null>(null)
  const mine = listsIn(lists, category)
  return (
    <div>
      <div className="list-head"><span className="mono">{category.toUpperCase()} PLAYLISTS</span>
        <button className="btn small" onClick={() => setSheet('new')}><Plus size={14} />NEW</button></div>
      {mine.length === 0 ? (
        <div className="panel empty-state"><p>No {category} playlists yet.</p><p className="dim">Make one, then add songs from a song&apos;s options. Playlists you made on the Mac come in with their playlists.json when you import.</p></div>
      ) : (
        <ul className="lists">
          {mine.map((l) => (
            <li key={l.id}>
              <button className="list-row" onClick={() => openList(l.id)}>
                <span className="t">{l.name}</span><span className="mono n">{String(countInList(songs, l)).padStart(2, '0')}</span>
              </button>
              <button className="icon-btn dots" aria-label={`${l.name} options`} onClick={() => setSheet({ id: l.id })}>{'···'}</button>
            </li>
          ))}
        </ul>
      )}
      {sheet && <ListSheet id={sheet === 'new' ? null : sheet.id} category={category} onClose={() => setSheet(null)} onCreated={(id) => { openList(id) }} />}
    </div>
  )
}

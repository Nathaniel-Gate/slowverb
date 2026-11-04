import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../state/library.store'
import { useLists } from '../state/lists.store'
import { catOfList, inCategory, songsOfList } from '../state/model'
import { useNav } from '../state/nav.store'
import { CategoryTabs } from './CategoryTabs'
import { UI } from './config'
import { ListSheet } from './ListSheet'
import { ListsView } from './ListsView'
import { Plus } from './icons'
import { SongList } from './SongList'

const HELP: Record<string, string> = {
  'Songs': 'Your music. Slowed and reverb versions you send from the Mac land here.',
  'Sound bites': 'Short clips. Play them on their own or layer them under a song.',
  'White noise': 'Rain, fans, hum. Layer them under a song from the Now Playing screen.'
}

export function Library({ openPlayer }: { openPlayer(): void }) {
  const { songs, loading, importFiles } = useLibrary()
  const lists = useLists((s) => s.lists)
  const { category, view, listId, setView, openList } = useNav()
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [editList, setEditList] = useState(false)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const list = listId ? lists.find((l) => l.id === listId) : undefined
  const shown = list ? songsOfList(songs, list) : inCategory(songs, category)
  const doImport = async () => {
    setBusy(true)
    try {
      const n = await importFiles(list ? catOfList(list) : category, list?.id ?? null)
      if (n > 0) { setToast(`+${n} ADDED`); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), UI.toastMs) }
    } finally { setBusy(false) }
  }
  const count = loading ? 'LOADING' : `${String(shown.length).padStart(2, '0')} ${shown.length === 1 ? 'SONG' : 'SONGS'}`

  return (
    <div className="screen">
      <div className="head">
        <span className="mono">SLOWVERB</span>
        <button className="btn" onClick={doImport} disabled={busy}><Plus size={16} />{busy ? 'IMPORTING' : 'IMPORT'}</button>
      </div>
      <h1 className="h1">{list ? list.name : category}</h1>
      <div className="mono sub">{list ? `${category.toUpperCase()} PLAYLIST · ` : ''}{count}</div>
      <CategoryTabs />
      {list ? (
        <div className="subnav"><button className="chip" onClick={() => openList(null)}>{'‹'} PLAYLISTS</button><button className="chip" onClick={() => setEditList(true)}>RENAME / DELETE</button></div>
      ) : (
        <div className="subnav">
          <button className={`chip ${view === 'songs' ? 'on' : ''}`} onClick={() => setView('songs')}>ALL</button>
          <button className={`chip ${view === 'lists' ? 'on' : ''}`} onClick={() => setView('lists')}>PLAYLISTS</button>
        </div>
      )}
      {!list && view === 'lists' ? <ListsView /> : !loading && shown.length === 0 ? (
        <div className="panel empty-state">
          <span className="mono">01 / {list ? 'Empty playlist' : `No ${category.toLowerCase()} yet`}</span>
          <p>{list ? 'Tap IMPORT to add songs here, or add existing ones from a song\'s options (hold a song).' : 'Tap IMPORT and pick audio from the Files app.'}</p>
          {!list && <p>{HELP[category]}</p>}
          {!list && category === 'Songs' && <p>Sent from your Mac? Open <b>iCloud Drive &gt; Slowverb Phone</b> and select the audio <b>and playlists.json</b> together.</p>}
        </div>
      ) : <SongList songs={shown} listId={list?.id ?? null} openPlayer={openPlayer} />}
      {toast && <div className="toast">{toast}</div>}
      {editList && list && <ListSheet id={list.id} category={category} onClose={() => setEditList(false)} onCreated={() => undefined} />}
    </div>
  )
}

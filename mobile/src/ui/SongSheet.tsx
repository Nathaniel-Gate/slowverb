import { CATEGORIES } from '@shared/config'
import { useState } from 'react'
import { useLibrary } from '../state/library.store'
import { useLists } from '../state/lists.store'
import { catOf, listsIn, songRel } from '../state/model'
import { fmtTime, fxTag } from './format'
import type { Song } from './types'

type Mode = 'main' | 'edit' | 'lists' | 'move'

/** Bottom action sheet for one song: play, rename (title + artist), add to / remove from playlists, move to another category, delete (asks twice).
 *  `listId` = the playlist the sheet was opened from (adds REMOVE FROM PLAYLIST). */
export function SongSheet({ song, startEdit, listId, onClose, onPlay }: { song: Song; startEdit: boolean; listId?: string | null; onClose(): void; onPlay(): void }) {
  const { rename, remove, move } = useLibrary()
  const { lists, toggle, create, removeSong } = useLists()
  const [mode, setMode] = useState<Mode>(startEdit ? 'edit' : 'main')
  const [sure, setSure] = useState(false)
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const [newName, setNewName] = useState('')
  const rel = songRel(song), cat = catOf(song), mine = listsIn(lists, cat)
  const save = async () => { if (title.trim()) await rename(song.id, title.trim(), artist.trim()); onClose() }
  const make = () => { const n = newName.trim(); if (n) { toggle(create(n, cat), rel); setNewName('') } }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Song options" onClick={(e) => e.stopPropagation()}>
        <span className="mono">{{ main: 'SONG', edit: 'RENAME', lists: 'ADD TO PLAYLIST', move: 'MOVE TO' }[mode]}</span>
        <div className="sheet-title">{song.title}</div>
        <div className="mono sub">{cat.toUpperCase()} {'·'} {song.artist || 'Unknown artist'} {'·'} {fmtTime(song.duration)}{fxTag(song.fx) ? ` · ${fxTag(song.fx)}` : ''}</div>
        {mode === 'edit' && (
          <>
            <label className="field"><span className="mono">TITLE</span><input value={title} onChange={(e) => setTitle(e.target.value)} autoCapitalize="words" enterKeyHint="next" /></label>
            <label className="field"><span className="mono">ARTIST</span><input value={artist} onChange={(e) => setArtist(e.target.value)} autoCapitalize="words" enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
            <div className="sheet-row"><button className="btn" onClick={onClose}>CANCEL</button><button className="btn solid" onClick={save} disabled={!title.trim()}>SAVE</button></div>
          </>
        )}
        {mode === 'lists' && (
          <div className="sheet-list">
            {mine.map((l) => { const on = l.songs.includes(rel); return (
              <button key={l.id} className={`btn wide pick ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => toggle(l.id, rel)}><span>{l.name}</span><span>{on ? 'IN' : 'ADD'}</span></button>
            ) })}
            {mine.length === 0 && <p className="set-note">No {cat} playlists yet. Name one to start it with this song.</p>}
            <div className="inline-new"><input value={newName} placeholder="New playlist name" maxLength={40} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && make()} enterKeyHint="done" />
              <button className="btn" onClick={make} disabled={!newName.trim()}>CREATE</button></div>
            <button className="btn wide ghost-btn" onClick={() => setMode('main')}>DONE</button>
          </div>
        )}
        {mode === 'move' && (
          <div className="sheet-list">
            {CATEGORIES.filter((c) => c !== cat).map((c) => <button key={c} className="btn wide" onClick={() => { void move(song.id, c); onClose() }}>{c.toUpperCase()}</button>)}
            <button className="btn wide ghost-btn" onClick={() => setMode('main')}>BACK</button>
          </div>
        )}
        {mode === 'main' && (
          <div className="sheet-list">
            <button className="btn wide" onClick={() => { onPlay(); onClose() }}>PLAY</button>
            <button className="btn wide" onClick={() => setMode('lists')}>ADD TO PLAYLIST</button>
            {listId && <button className="btn wide" onClick={() => { removeSong(listId, rel); onClose() }}>REMOVE FROM THIS PLAYLIST</button>}
            <button className="btn wide" onClick={() => setMode('move')}>MOVE TO ANOTHER CATEGORY</button>
            <button className="btn wide" onClick={() => setMode('edit')}>RENAME</button>
            <button className={`btn wide ${sure ? 'solid' : ''}`} onClick={() => { if (sure) { void remove(song.id); onClose() } else setSure(true) }}>{sure ? 'TAP AGAIN TO DELETE' : 'DELETE'}</button>
            <button className="btn wide ghost-btn" onClick={onClose}>CANCEL</button>
          </div>
        )}
      </div>
    </div>
  )
}

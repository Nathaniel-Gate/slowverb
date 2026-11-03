import { useState } from 'react'
import { useLibrary } from '../state/library.store'
import { fmtTime, fxTag } from './format'
import type { Song } from './types'

/** Bottom action sheet for one song: play, rename (title + artist), delete (asks twice). */
export function SongSheet({ song, startEdit, onClose, onPlay }: { song: Song; startEdit: boolean; onClose(): void; onPlay(): void }) {
  const { rename, remove } = useLibrary()
  const [edit, setEdit] = useState(startEdit)
  const [sure, setSure] = useState(false)
  const [title, setTitle] = useState(song.title)
  const [artist, setArtist] = useState(song.artist)
  const save = async () => { if (title.trim()) await rename(song.id, title.trim(), artist.trim()); onClose() }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Song options" onClick={(e) => e.stopPropagation()}>
        <span className="mono">{edit ? 'RENAME' : 'SONG'}</span>
        <div className="sheet-title">{song.title}</div>
        <div className="mono sub">{song.artist || 'Unknown artist'} {'·'} {fmtTime(song.duration)}{fxTag(song.fx) ? ` · ${fxTag(song.fx)}` : ''}</div>
        {edit ? (
          <>
            <label className="field"><span className="mono">TITLE</span><input value={title} onChange={(e) => setTitle(e.target.value)} autoCapitalize="words" enterKeyHint="next" /></label>
            <label className="field"><span className="mono">ARTIST</span><input value={artist} onChange={(e) => setArtist(e.target.value)} autoCapitalize="words" enterKeyHint="done" onKeyDown={(e) => e.key === 'Enter' && save()} /></label>
            <div className="sheet-row"><button className="btn" onClick={onClose}>CANCEL</button><button className="btn solid" onClick={save} disabled={!title.trim()}>SAVE</button></div>
          </>
        ) : (
          <div className="sheet-list">
            <button className="btn wide" onClick={() => { onPlay(); onClose() }}>PLAY</button>
            <button className="btn wide" onClick={() => setEdit(true)}>RENAME</button>
            <button className={`btn wide ${sure ? 'solid' : ''}`} onClick={() => { if (sure) { void remove(song.id); onClose() } else setSure(true) }}>{sure ? 'TAP AGAIN TO DELETE' : 'DELETE'}</button>
            <button className="btn wide ghost-btn" onClick={onClose}>CANCEL</button>
          </div>
        )}
      </div>
    </div>
  )
}

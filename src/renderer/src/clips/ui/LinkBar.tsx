import { useState } from 'react'
import { CLIPS } from '../../config/clips'
import { useClips } from '../clips.store'

const ago = (ms: number | null) => {
  if (!ms) return 'never synced'
  const m = Math.round((Date.now() - ms) / 60000)
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}

/** "Paste a link or board": picture/video links download straight in, Pinterest boards/pins/profiles sync through gallery-dl,
 *  any other site goes to yt-dlp as a video. SYNC PINTEREST re-fetches every saved board (only new pins come down). */
export function LinkBar() {
  const dl = useClips((s) => s.dl), priv = useClips((s) => s.privateBoards), boards = useClips((s) => s.pins.boards)
  const [url, setUrl] = useState('')
  const go = () => { const v = url.trim(); if (!v || dl.busy) return; void useClips.getState().fetchLink(v).then((p) => { if (p.length || !useClips.getState().dl.error) setUrl('') }) }
  return (
    <div className="dk-sec cl-link">
      <div className="cl-link-row">
        <input className="find-in" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter') go() }}
          placeholder="Paste a link or board" spellCheck={false} disabled={dl.busy} aria-label="Link to a picture, video or Pinterest board" />
        {dl.busy ? <button className="chip" onClick={() => useClips.getState().cancel()}>CANCEL</button> : <button className="chip" disabled={!url.trim()} onClick={go}>GET</button>}
      </div>
      {(dl.busy || dl.note) && (
        <div className={`cl-dl ${dl.error ? 'bad' : ''}`} role="status">
          {dl.busy && <div className="cl-dl-bar"><i style={{ transform: `scaleX(${dl.pct === null ? 0.3 : Math.max(0.02, dl.pct / 100)})` }} data-indeterminate={dl.pct === null || undefined} /></div>}
          <span className="mono">{dl.busy ? `${dl.stage}${dl.pct !== null ? ` ${Math.round(dl.pct)}%` : ''}` : dl.note}</span>
          {!dl.busy && dl.error && dl.last && <button className="chip" onClick={() => void (dl.last === 'pinterest' ? useClips.getState().syncPinterest() : useClips.getState().fetchLink(dl.last))}>RETRY</button>}
        </div>
      )}
      <div className="cl-pin-row">
        <button className="chip" disabled={dl.busy || !boards.length} onClick={() => void useClips.getState().syncPinterest()} title={boards.length ? 'Fetch new pins from every saved board' : 'Paste a Pinterest board link first'}>SYNC PINTEREST</button>
        <label className="cl-switch mono" title={CLIPS.keychainHint}>
          <input type="checkbox" role="switch" checked={priv} onChange={(e) => useClips.getState().setPrivate(e.target.checked)} /> PRIVATE BOARDS
        </label>
      </div>
      {priv && <p className="dk-note mono" title={CLIPS.keychainHint}>{CLIPS.keychainShort}</p>}
      {!!boards.length && (
        <ul className="cl-boards">
          {boards.map((b) => (
            <li key={b.url} title={b.lastError ?? b.url}>
              <span className="cl-board-name">{b.label}</span>
              <span className="mono dk-dim">{b.count} · {b.lastError ? 'failed' : ago(b.lastSync)}</span>
              <button className="ghost cl-forget" title="Stop syncing this board (keeps the pictures already downloaded)" onClick={() => void useClips.getState().forgetBoard(b.url)}>&times;</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

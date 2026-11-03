import { useEffect, useRef, useState } from 'react'
import { useLibrary } from '../state/library.store'
import { usePlayer } from '../state/player.store'
import { useSettings } from '../state/settings.store'
import { UI } from './config'
import { SongRow } from './SongRow'
import { SongSheet } from './SongSheet'
import { Plus } from './icons'
import type { Song } from './types'

export function Library({ openPlayer }: { openPlayer(): void }) {
  const { songs, loading, importFiles, remove } = useLibrary()
  const { cur, playing, play } = usePlayer()
  const playOnTap = useSettings((s) => s.playOnTap)
  const [openId, setOpenId] = useState<string | null>(null)
  const [sheet, setSheet] = useState<{ song: Song; edit: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const timer = useRef(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const doImport = async () => {
    setBusy(true)
    try {
      const n = await importFiles()
      if (n > 0) { setToast(`+${n} ADDED`); window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setToast(null), UI.toastMs) }
    } finally { setBusy(false) }
  }
  const tap = (s: Song) => {
    if (s.id === cur) return openPlayer()
    if (playOnTap) void play(s.id)
    else setSheet({ song: s, edit: false })
  }

  return (
    <div className="screen" onPointerDown={(e) => { if (openId && !(e.target as HTMLElement).closest('.song')) setOpenId(null) }}>
      <div className="head">
        <span className="mono">SLOWVERB</span>
        <button className="btn" onClick={doImport} disabled={busy}><Plus size={16} />{busy ? 'IMPORTING' : 'IMPORT'}</button>
      </div>
      <h1 className="h1">Library</h1>
      <div className="mono sub">{loading ? 'LOADING' : `${String(songs.length).padStart(2, '0')} ${songs.length === 1 ? 'SONG' : 'SONGS'}`}</div>

      {!loading && songs.length === 0 ? (
        <div className="panel empty-state">
          <span className="mono">01 / Get started</span>
          <p>Tap IMPORT and pick songs from the Files app.</p>
          <p>If you used SEND TO PHONE on your Mac, open <b>iCloud Drive &gt; Slowverb Phone</b> and select the songs there.</p>
          <p className="dim">Each song remembers its own slowed and reverb version.</p>
        </div>
      ) : (
        <ul className="songs">
          {songs.map((s, i) => (
            <SongRow key={s.id} song={s} index={i} current={s.id === cur} playing={playing} open={openId === s.id}
              onTap={() => tap(s)} onLong={() => { setOpenId(null); setSheet({ song: s, edit: false }) }}
              onOpen={(o) => setOpenId(o ? s.id : openId === s.id ? null : openId)}
              onEdit={() => setSheet({ song: s, edit: true })} onDelete={() => { setOpenId(null); void remove(s.id) }} />
          ))}
        </ul>
      )}
      {toast && <div className="toast">{toast}</div>}
      {sheet && <SongSheet song={sheet.song} startEdit={sheet.edit} onClose={() => setSheet(null)} onPlay={() => { void play(sheet.song.id) }} />}
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import type { DlProgress } from '../../../../shared/types'
import { Progress } from '../../ui/Progress'
import { useSmooth } from '../../ui/useSmooth'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'

/** Paste a link or type a song name, press Enter or ADD: audio is downloaded (yt-dlp), added to the playlist and played. */
export function DownloadBar() {
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false)
  const [prog, setProg] = useState<DlProgress | null>(null), [note, setNote] = useState<{ text: string; err?: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => window.api.onDownloadProgress?.(setProg), [])
  // overall % across playlist items; null (unknown) keeps the last known value so the bar never jumps back
  const overall = prog ? (prog.pct === null ? null : prog.item ? ((prog.item.i - 1 + prog.pct / 100) / prog.item.n) * 100 : prog.pct) : null
  const shown = useSmooth(overall, busy || !!prog)
  const flash = (n: { text: string; err?: boolean }, ms = 2600) => { setNote(n); clearTimeout(timer.current); timer.current = window.setTimeout(() => setNote(null), n.err ? 9000 : ms) }

  const go = async () => {
    const link = url.trim(); if (!link || busy) return
    setBusy(true); setProg({ stage: 'Starting', pct: null }); setNote(null)
    const r = await window.api.download(link)
    if (r.paths?.length) {
      const added = await useLibrary.getState().addPaths(r.paths)
      const t = added[0] ?? useLibrary.getState().tracks.find((x) => x.path === r.paths![0])
      if (t) usePlayer.getState().play(t.id)
      setUrl(''); flash({ text: added.length ? `Added ${added.length}` : 'Already in playlist' })
    } else if (r.error !== 'Cancelled') flash({ text: r.error ?? 'Failed', err: true })
    setBusy(false); setProg(null)
  }
  const label = prog ? `${prog.stage}${prog.item && prog.item.n > 1 ? ` · ${prog.item.i}/${prog.item.n}` : ''}${prog && prog.pct !== null && prog.stage === 'Downloading' ? ` · ${Math.round(shown)}%` : ''}` : ''
  return (
    <div className="dl">
      <div className="dl-row">
        <input className="dl-input" value={url} disabled={busy} placeholder="Paste a link or song name" spellCheck={false}
          onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        {busy
          ? <button className="dl-btn cancel" onClick={() => window.api.cancelDownload()}>CANCEL</button>
          : <button className="dl-btn" disabled={!url.trim()} onClick={go}>ADD</button>}
      </div>
      <div className={`dl-feedback ${busy || prog || note ? 'show' : ''}`}>
        {(busy || prog) && <><Progress pct={overall === null ? null : shown} /><div className="mono dl-status">{label}</div></>}
        {!busy && !prog && note && <div className={`mono dl-status ${note.err ? 'err' : ''}`}>{note.text}</div>}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'

/** Paste a link, press Enter: audio is downloaded (yt-dlp), added to the playlist and played. */
export function DownloadBar() {
  const [url, setUrl] = useState(''), [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ text: string; err?: boolean } | null>(null)
  useEffect(() => window.api.onDownloadProgress((p) => setStatus({ text: p.stage === 'Downloading' ? `Downloading ${Math.round(p.pct)}%` : p.stage })), [])
  const go = async () => {
    const link = url.trim(); if (!link || busy) return
    setBusy(true); setStatus({ text: 'Preparing' })
    const r = await window.api.download(link)
    if (r.path) {
      const added = await useLibrary.getState().addPaths([r.path])
      const t = added[0] ?? useLibrary.getState().tracks.find((x) => x.path === r.path)
      if (t) usePlayer.getState().play(t.id)
      setUrl(''); setStatus({ text: added.length ? 'Added' : 'Already in playlist' })
    } else setStatus({ text: r.error ?? 'Failed', err: true })
    setBusy(false); setTimeout(() => setStatus((s) => (s && !s.err ? null : s)), 2500)
  }
  return (
    <div className="dl">
      <input className="dl-input" value={url} disabled={busy} placeholder="Paste a YouTube link, Enter" spellCheck={false}
        onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      {status && <div className={`mono dl-status ${status.err ? 'err' : ''}`}>{status.text}</div>}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { categoryOf } from '../../../../shared/libraryModel'
import type { Track } from '../../../../shared/types'
import { useEditor } from '../../editor/editor.store'
import { fmt } from '../../lib/format'
import { useFlip } from '../../ui/useFlip'
import { DownloadBar } from '../download/DownloadBar'
import { ListsPane } from '../lists/ListsPane'
import { SongMenu } from '../lists/SongMenu'
import { useLists } from '../lists/lists.store'
import { SettingsButton } from '../settings/SettingsButton'
import { useSettings } from '../settings/settings.store'
import { PlaylistTree } from '../playlists/PlaylistTree'
import { fileRel, relOf, usePlaylists } from '../playlists/playlists.store'
import { usePlayer } from '../player/player.store'
import { useLibrary } from './library.store'

const TRACK_MIME = 'application/x-slowverb-track'
const SORTS = [{ k: 'added', label: 'ADDED' }, { k: 'title', label: 'A–Z' }, { k: 'length', label: 'LENGTH' }] as const
type SortKey = (typeof SORTS)[number]['k']

export function Playlist() {
  const { tracks, moveBefore } = useLibrary()
  const { cur, play, playing } = usePlayer()
  const { root, sel } = usePlaylists()
  const { lists, mode, listSel } = useLists()
  const list = useFlip<HTMLDivElement>()
  const [q, setQ] = useState(''), [sort, setSort] = useState<SortKey>('added')
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null)
  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  const pl = mode === 'lists' && listSel ? lists.find((l) => l.id === listSel) ?? null : null
  const base = useMemo(() => {
    if (pl) { const by = new Map(tracks.map((t) => [fileRel(root, t.path), t])); return pl.songs.map((r) => by.get(r)).filter((t): t is Track => !!t) }
    return mode === 'files' && sel !== null ? tracks.filter((t) => relOf(root, t.path) === sel) : tracks
  }, [tracks, root, sel, mode, pl])
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const f = needle ? base.filter((t) => `${t.title} ${t.artist}`.toLowerCase().includes(needle)) : base
    return sort === 'title' ? [...f].sort((a, b) => a.title.localeCompare(b.title)) : sort === 'length' ? [...f].sort((a, b) => a.duration - b.duration) : f
  }, [base, q, sort])
  const title = pl ? pl.name : mode === 'lists' || sel === null ? 'All songs' : sel === '' ? 'Unsorted' : sel.slice(sel.lastIndexOf('/') + 1)
  const chips = (t: Track) => { const r = fileRel(root, t.path); return r ? lists.filter((l) => l.songs.includes(r)).map((l) => l.name) : [] }
  const canReorder = sort === 'added' && !q && !pl

  return (
    <aside className="side">
      {mode === 'files' ? <PlaylistTree /> : <ListsPane />}
      <DownloadBar />
      <div className="side-head row"><span className="mono">{title} · {shown.length}</span><SettingsButton /></div>
      <div className="find">
        <input className="find-in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" spellCheck={false} onKeyDown={(e) => e.key === 'Escape' && setQ('')} />
        <button className="ghost" title="Sort order" onClick={() => setSort(SORTS[(SORTS.findIndex((s) => s.k === sort) + 1) % SORTS.length].k)}>{SORTS.find((s) => s.k === sort)!.label}</button>
      </div>
      <div className="list" ref={list}>
        {!shown.length && <div className="empty mono">{q ? 'No match.' : <>Empty.<br />Drag audio files here, or paste a link above.</>}</div>}
        {shown.map((t, i) => {
          const c = chips(t), r = fileRel(root, t.path), home = r ? categoryOf(r) : null
          return (
            <div key={t.id} data-flip={t.id} draggable className={`item ${t.id === cur ? 'cur' : ''}`} style={{ animationDelay: `${Math.min(i, 12) * 24}ms` }}
              onDragStart={(e) => { e.dataTransfer.setData(TRACK_MIME, t.id); e.dataTransfer.effectAllowed = 'copyMove' }}
              onDragOver={(e) => { if (canReorder && e.dataTransfer.types.includes(TRACK_MIME)) e.preventDefault() }}
              onDrop={(e) => { const id = e.dataTransfer.getData(TRACK_MIME); if (id && canReorder) { e.preventDefault(); e.stopPropagation(); moveBefore(id, t.id) } }}
              onClick={() => (useSettings.getState().playOnClick ? play(t.id) : usePlayer.getState().select(t.id))} onDoubleClick={() => void useEditor.getState().openSong(t.path)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setMenu({ id: t.id, x: e.clientX, y: e.clientY }) }}>
              <span className="n">{t.id === cur ? <span className={`eq ${playing ? '' : 'paused'}`}><i /><i /><i /></span> : String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div className="t">{t.title}</div>
                <div className="a">{[t.artist, t.fx && t.fx.speed !== 1 ? `${t.fx.speed.toFixed(2)}x` : ''].filter(Boolean).join(' · ')}</div>
                {(c.length > 0 || home === 'Sound bites') && (
                  <div className="chips">
                    {home === 'Sound bites' && <span className="chip home">SOUND BITE</span>}
                    {c.slice(0, 2).map((n) => <span key={n} className="chip">{n}</span>)}{c.length > 2 && <span className="chip">+{c.length - 2}</span>}
                  </div>
                )}
              </div>
              <span className="n">{fmt(t.duration)}</span>
              <button className="more" title="Move, add to playlist, delete" aria-label="Song options" onClick={(e) => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); setMenu({ id: t.id, x: b.right - 230, y: b.bottom + 4 }) }} onDoubleClick={(e) => e.stopPropagation()}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor"><circle cx="2.5" cy="7" r="1.15" /><circle cx="7" cy="7" r="1.15" /><circle cx="11.5" cy="7" r="1.15" /></svg>
              </button>
            </div>
          )
        })}
      </div>
      <div className="side-head"><span className="mono">Double-click edits · ⋯ for options · drag to a folder to move, to a playlist to add</span></div>
      {menu && <SongMenu id={menu.id} x={menu.x} y={menu.y} inList={pl?.id ?? null} onClose={() => setMenu(null)} />}
    </aside>
  )
}

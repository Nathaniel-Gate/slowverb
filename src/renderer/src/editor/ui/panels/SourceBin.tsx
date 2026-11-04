import { useEffect, useMemo, useRef, useState } from 'react'
import { CATEGORIES, MISC_ARTIST } from '../../../../../shared/config'
import { categoryOf } from '../../../../../shared/libraryModel'
import { artistCounts } from '../../../features/lists/artists'
import { useLists } from '../../../features/lists/lists.store'
import * as ops from '../../ops'
import { useLibrary } from '../../../features/library/library.store'
import { fileRel, usePlaylists } from '../../../features/playlists/playlists.store'
import { useEditor } from '../../editor.store'
import { MiniWave } from './MiniWave'
import { cachedSource, usePanels } from './panels.store'
import { fmtTime } from './timecode'
import { useSlidePill } from './useSlidePill'

export const SOURCE_MIME = 'application/x-slowverb-source'

export function SourceBin() {
  const tracks = useLibrary((s) => s.tracks), { root } = usePlaylists(), lists = useLists((s) => s.lists)
  const { picked, loading, auditioning, ranges } = usePanels()
  const [q, setQ] = useState(''), [cat, setCat] = useState<string>(''), [listId, setListId] = useState(''), [artist, setArtist] = useState('')   // library browser filters ('' = all)
  const hasProject = useEditor((s) => !!s.project)
  const box = useRef<HTMLDivElement>(null), pill = useRef<HTMLDivElement>(null)
  const artists = useMemo(() => artistCounts(tracks), [tracks])
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase(), inList = listId ? new Set(lists.find((l) => l.id === listId)?.songs ?? []) : null
    return tracks.filter((t) => {
      const rel = fileRel(root, t.path)
      return (!cat || (rel && categoryOf(rel) === cat)) && (!inList || (rel && inList.has(rel))) && (!artist || (t.artist.trim() || MISC_ARTIST).toLowerCase() === artist.toLowerCase())
        && (!needle || `${t.title} ${t.artist}`.toLowerCase().includes(needle))
    })
  }, [tracks, root, lists, q, cat, listId, artist])
  const track = tracks.find((t) => t.path === picked), data = picked ? cachedSource(picked) : null
  const dur = data?.buf.duration ?? track?.duration ?? 0, range = picked ? ranges[picked] : undefined
  useSlidePill(box, pill, [picked, list.length, q, cat, listId, artist])
  useEffect(() => () => usePanels.getState().stopAudition(), [])
  /** Whole song (or the chosen range) onto a brand-new track at the playhead: the one-click way to layer a song into a mix. */
  const addAsTrack = async (path: string, title: string, r?: { in: number; out: number }) => {
    const ed = useEditor.getState(); if (!ed.project) return
    const before = new Set(ed.project.tracks.map((t) => t.id))
    ed.apply((p) => ops.addTrack(p, title.slice(0, 24)))
    const id = useEditor.getState().project?.tracks.find((t) => !before.has(t.id))?.id
    if (id) await useEditor.getState().insertSource(path, useEditor.getState().now(), id, 'overwrite', r)
  }

  const isFull = !range || (range.in <= 0 && range.out >= dur - 1e-3), full = isFull
  const place = (mode: 'insert' | 'overwrite') => {
    if (!picked || !hasProject) return
    const full = isFull, ed = useEditor.getState()
    void ed.insertSource(picked, ed.now(), undefined, mode, full ? undefined : range)
  }
  useEffect(() => {   // , = insert  . = overwrite (only while this panel is on screen)
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null; if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ',') { e.preventDefault(); place('insert') } else if (e.key === '.') { e.preventDefault(); place('overwrite') }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key)
  })

  return (
    <div className="dk-stack">
      <div className="row"><span className="mono">YOUR SONGS · {list.length}</span></div>
      <input className="find-in dk-find" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" spellCheck={false} />
      <div className="dk-filters">
        <span className="dk-seg">
          <button className={`ghost ${cat === '' ? 'on' : ''}`} onClick={() => setCat('')}>ALL</button>
          {CATEGORIES.map((c) => <button key={c} className={`ghost ${cat === c ? 'on' : ''}`} onClick={() => setCat(cat === c ? '' : c)}>{c === 'Sound bites' ? 'BITES' : c === 'White noise' ? 'NOISE' : 'SONGS'}</button>)}
        </span>
        <select className="find-sel" value={listId} onChange={(e) => setListId(e.target.value)} title="Only songs in this playlist"><option value="">All playlists</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        {artists.length > 1 && <select className="find-sel" value={artist} onChange={(e) => setArtist(e.target.value)} title="Only this artist"><option value="">All artists</option>{artists.map((a) => <option key={a.name} value={a.name}>{a.name}</option>)}</select>}
      </div>
      <div className="dk-list" ref={box}>
        <div className="dk-rowpill" ref={pill} />
        {list.map((t) => (
          <div key={t.id} data-sel={t.path === picked ? 1 : 0} className={`dk-song ${t.path === picked ? 'on' : ''}`} draggable title="Drag onto the timeline"
            onClick={() => void usePanels.getState().pick(t.path === picked ? null : t.path)}
            onDragStart={(e) => {
              const r = usePanels.getState().ranges[t.path], full = !r || (r.in <= 0 && r.out >= t.duration - 1e-3)
              e.dataTransfer.setData(SOURCE_MIME, JSON.stringify(full ? { path: t.path } : { path: t.path, in: r.in, out: r.out })); e.dataTransfer.effectAllowed = 'copy'
            }}>
            <span className="dk-song-name">{t.title}</span><span className="mono dk-dim">{fmtTime(t.duration).replace(/\.\d+$/, '')}</span>
            <button className="dk-add" disabled={!hasProject} title="Add this whole song on a new track at the playhead" onClick={(e) => { e.stopPropagation(); void addAsTrack(t.path, t.title) }}>+</button>
          </div>
        ))}
        {!list.length && <p className="dk-empty mono">No songs here</p>}
      </div>
      {picked && (
        <div className="dk-sec">
          {data ? <MiniWave key={picked} path={picked} peaks={data.peaks} duration={dur} /> : <div className="dk-mini-wave dk-loading mono" style={{ height: 64 }}>{loading === picked ? 'Loading' : 'Unavailable'}</div>}
          <div className="dk-btns">
            <button className={`chip ${auditioning ? 'on' : ''}`} disabled={!data} onClick={() => usePanels.getState().toggleAudition()}>{auditioning ? 'STOP' : 'PLAY'}</button>
            <button className="chip" disabled={!data || !hasProject} onClick={() => void addAsTrack(picked, track?.title ?? 'Song', full ? undefined : range)} title="Put it on a new track at the playhead, to layer it with what is already there">NEW TRACK</button>
            <button className="chip" disabled={!data || !hasProject} onClick={() => place('insert')} title="Insert at the playhead, pushing later clips right (,)">INSERT ,</button>
            <button className="chip" disabled={!data || !hasProject} onClick={() => place('overwrite')} title="Overwrite at the playhead (.)">OVERWRITE .</button>
          </div>
          <p className="dk-note mono">NEW TRACK layers it with what is playing. Insert and overwrite use the selected track. You can also drag a song onto the timeline.</p>
        </div>
      )}
    </div>
  )
}

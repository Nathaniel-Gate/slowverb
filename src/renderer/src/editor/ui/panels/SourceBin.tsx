import { useEffect, useRef } from 'react'
import { useLibrary } from '../../../features/library/library.store'
import { relOf, usePlaylists } from '../../../features/playlists/playlists.store'
import { useEditor } from '../../editor.store'
import { MiniWave } from './MiniWave'
import { cachedSource, usePanels } from './panels.store'
import { fmtTime } from './timecode'
import { useSlidePill } from './useSlidePill'

export const SOURCE_MIME = 'application/x-slowverb-source'

export function SourceBin() {
  const tracks = useLibrary((s) => s.tracks), { root, sel } = usePlaylists()
  const { scope, picked, loading, auditioning, ranges } = usePanels()
  const hasProject = useEditor((s) => !!s.project)
  const box = useRef<HTMLDivElement>(null), pill = useRef<HTMLDivElement>(null)
  const list = scope === 'all' || sel === null ? tracks : tracks.filter((t) => relOf(root, t.path) === sel)
  const track = tracks.find((t) => t.path === picked), data = picked ? cachedSource(picked) : null
  const dur = data?.buf.duration ?? track?.duration ?? 0, range = picked ? ranges[picked] : undefined
  useSlidePill(box, pill, [picked, list.length, scope, sel])
  useEffect(() => () => usePanels.getState().stopAudition(), [])

  const place = (mode: 'insert' | 'overwrite') => {
    if (!picked || !hasProject) return
    const full = !range || (range.in <= 0 && range.out >= dur - 1e-3), ed = useEditor.getState()
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
      <div className="row"><span className="mono">SONGS</span>
        <span className="dk-seg">
          <button className={`ghost ${scope === 'playlist' ? 'on' : ''}`} onClick={() => usePanels.getState().setScope('playlist')}>PLAYLIST</button>
          <button className={`ghost ${scope === 'all' ? 'on' : ''}`} onClick={() => usePanels.getState().setScope('all')}>ALL</button>
        </span></div>
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
          </div>
        ))}
        {!list.length && <p className="dk-empty mono">No songs here</p>}
      </div>
      {picked && (
        <div className="dk-sec">
          {data ? <MiniWave key={picked} path={picked} peaks={data.peaks} duration={dur} /> : <div className="dk-mini-wave dk-loading mono" style={{ height: 64 }}>{loading === picked ? 'Loading' : 'Unavailable'}</div>}
          <div className="dk-btns">
            <button className={`chip ${auditioning ? 'on' : ''}`} disabled={!data} onClick={() => usePanels.getState().toggleAudition()}>{auditioning ? 'STOP' : 'PLAY'}</button>
            <button className="chip" disabled={!data || !hasProject} onClick={() => place('insert')} title="Insert at the playhead, pushing later clips right (,)">INSERT ,</button>
            <button className="chip" disabled={!data || !hasProject} onClick={() => place('overwrite')} title="Overwrite at the playhead (.)">OVERWRITE .</button>
          </div>
          <p className="dk-note mono">Insert lands on the targeted track at the playhead.</p>
        </div>
      )}
    </div>
  )
}

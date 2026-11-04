import { useEffect, useMemo, useState } from 'react'
import { mediaUrl } from '../../../../shared/mediaUrl'
import { useEditor } from '../../editor/editor.store'
import { filtered, groupsOf, useClips } from '../clips.store'
import { insertMedia } from '../insertMedia'
import { LinkBar } from './LinkBar'

export const MEDIA_MIME = 'application/x-slowverb-media'   // JSON { path }, dragged from the media browser onto the Clips timeline

/** MEDIA tab of the Clips dock: the Visuals library (search, kind and folder filters, thumbnails), drag onto the timeline,
 *  + puts it on a new track at the playhead, click to preview. The link bar on top downloads pictures, videos and Pinterest boards. */
export function MediaBin() {
  const s = useClips(), hasProject = useEditor((e) => !!e.project)
  const list = useMemo(() => filtered(s), [s.items, s.q, s.kind, s.group])   // eslint-disable-line react-hooks/exhaustive-deps -- filters only
  const groups = useMemo(() => groupsOf(s.items), [s.items])
  const [shown, setShown] = useState(60)   // grow the grid as you scroll, never thousands of tiles at once
  useEffect(() => { if (!s.loaded) void s.refresh() }, [s.loaded])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { list.slice(0, shown).forEach((i) => s.thumb(i.path)) }, [list, shown])   // eslint-disable-line react-hooks/exhaustive-deps
  const picked = s.items.find((i) => i.path === s.picked)
  const at = () => useEditor.getState().now()
  return (
    <div className="dk-stack cl-media">
      <LinkBar />
      <div className="row"><span className="mono">VISUALS · {list.length}</span></div>
      <input className="find-in dk-find" value={s.q} onChange={(e) => s.set({ q: e.target.value })} placeholder="Search" spellCheck={false} />
      <div className="dk-filters">
        <span className="dk-seg">
          {(['', 'image', 'video'] as const).map((k) => <button key={k || 'all'} className={`ghost ${s.kind === k ? 'on' : ''}`} onClick={() => s.set({ kind: k })}>{k === '' ? 'ALL' : k === 'image' ? 'PICS' : 'VIDEO'}</button>)}
        </span>
        <select className="find-sel" value={s.group} onChange={(e) => s.set({ group: e.target.value })} title="Only this folder or board">
          <option value="">All folders</option>{groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <div className="cl-grid" onScroll={(e) => { const el = e.currentTarget; if (el.scrollTop + el.clientHeight > el.scrollHeight - 200) setShown((n) => n + 60) }}>
        {list.slice(0, shown).map((i) => {
          const th = s.thumbs[i.path]
          return (
            <div key={i.path} className={`cl-tile ${i.path === s.picked ? 'on' : ''}`} draggable title={`${i.name} (${i.group}). Drag onto the timeline`}
              onClick={() => s.set({ picked: i.path === s.picked ? null : i.path })}
              onDragStart={(e) => { e.dataTransfer.setData(MEDIA_MIME, JSON.stringify({ path: i.path })); e.dataTransfer.effectAllowed = 'copy' }}>
              {th ? <img src={th} alt="" draggable={false} /> : th === null && i.kind === 'image' ? <img src={mediaUrl(i.path)} alt="" draggable={false} /> : <span className="cl-tile-ph mono">{i.kind === 'video' ? 'VIDEO' : '...'}</span>}
              {i.kind === 'video' && <b className="cl-tile-kind mono">VID</b>}
              <button className="dk-add cl-tile-add" disabled={!hasProject} title="Put it on a new track at the playhead"
                onClick={(e) => { e.stopPropagation(); void insertMedia(i.path, at(), { newTrack: true }) }}>+</button>
            </div>
          )
        })}
        {!list.length && <p className="dk-empty mono cl-grid-empty">{s.items.length ? 'Nothing matches' : 'No pictures yet. Drop pictures or videos onto this tab, or paste a link above.'}</p>}
      </div>
      {picked && (
        <div className="dk-sec">
          <div className="cl-peek">{picked.kind === 'video'
            ? <video src={mediaUrl(picked.path)} muted loop autoPlay={false} controls={false} preload="metadata" onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)} onMouseLeave={(e) => e.currentTarget.pause()} />
            : <img src={mediaUrl(picked.path)} alt={picked.name} />}</div>
          <span className="mono dk-dim cl-peek-name">{picked.name}</span>
          <div className="dk-btns">
            <button className="chip" disabled={!hasProject} onClick={() => void insertMedia(picked.path, at(), { newTrack: true })} title="On a new track at the playhead, layered over what is there">NEW TRACK</button>
            <button className="chip" disabled={!hasProject} onClick={() => void insertMedia(picked.path, at(), { mode: 'insert' })} title="Insert at the playhead, pushing later clips right">INSERT</button>
            <button className="chip" disabled={!hasProject} onClick={() => void insertMedia(picked.path, at(), { mode: 'overwrite' })} title="Overwrite at the playhead">OVERWRITE</button>
          </div>
        </div>
      )}
    </div>
  )
}

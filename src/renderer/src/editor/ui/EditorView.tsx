import { useEffect, useRef } from 'react'
import { useEditor } from '../editor.store'
import { useEditorKeys } from '../useEditorKeys'
import { HeaderBar } from './HeaderBar'
import { Dock } from './panels/Dock'
import { Timeline } from './Timeline'
import { ToolStrip } from './ToolStrip'
import { TrackHeaders } from './TrackHeaders'
import { Stage } from '../../clips/ui/Stage'
import { useClipsDrop } from '../../clips/ui/useClipsDrop'
import '../../clips/ui/clips.css'

/** The editor surface: header, tool strip, track headers + timeline. App mounts it over the player and fades it in/out (`leaving`). */
export function EditorView({ leaving }: { leaving: boolean }) {
  useEditorKeys()
  const busy = useEditor((s) => s.busy), ready = useEditor((s) => !!s.project), visual = useEditor((s) => s.view === 'visual')
  const drop = useClipsDrop(visual)   // Clips tab: pictures/videos dropped from Finder are imported and placed
  const area = useRef<HTMLDivElement>(null)
  useEffect(() => {   // tell the store how wide the timeline is, so "fit" and zoom keys work
    const el = area.current; if (!el) return
    const ro = new ResizeObserver(() => useEditor.getState().setViewWidth(el.clientWidth)); ro.observe(el); useEditor.getState().setViewWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [ready])
  return (
    <div className={`editor ${leaving ? 'leaving' : ''} ${visual ? 'clips' : ''}`} aria-hidden={leaving} {...drop.handlers}>
      <HeaderBar />
      {ready ? (
        <div className="ed-body">
          <ToolStrip />
          <div className="cl-col">
            {visual && <Stage />}
            <div className="ed-main">
              <TrackHeaders />
              <div className="ed-timeline" ref={area}><Timeline /></div>
            </div>
          </div>
          <Dock />
        </div>
      ) : <div className="ed-loading mono">{busy ?? 'Loading'}</div>}
      {drop.over && <div className="drop"><span className="mono">Drop pictures or videos to add them</span></div>}
    </div>
  )
}

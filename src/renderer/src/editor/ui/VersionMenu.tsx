import { useState, type RefObject } from 'react'
import { useEditor } from '../editor.store'
import { Popover } from './Popover'

/** Version list under the version name: switch, new, duplicate, rename, delete (delete asks once more). */
export function VersionMenu({ anchor, open, onClose, onRename }: { anchor: RefObject<HTMLElement | null>; open: boolean; onClose: () => void; onRename: () => void }) {
  const versions = useEditor((s) => s.versions), cur = useEditor((s) => s.project?.name), [sure, setSure] = useState<string | null>(null)
  const ed = useEditor.getState()
  const done = (f: () => void) => () => { onClose(); setSure(null); f() }
  return (
    <Popover anchor={anchor} open={open} onClose={() => { setSure(null); onClose() }} className="ed-ver">
      <div className="ed-pop-title mono">VERSIONS</div>
      {versions.map((v) => (
        <div key={v} className={`ed-ver-row ${v === cur ? 'on' : ''}`}>
          <button className="ed-ver-name" onClick={done(() => void ed.openVersion(v))}><span className="ed-cm-check">{v === cur ? '✓' : ''}</span>{v}</button>
          {versions.length > 1 && (sure === v
            ? <button className="ed-ver-x sure mono" onClick={done(() => void ed.deleteVersion(v))}>DELETE?</button>
            : <button className="ed-ver-x" title={`Delete ${v}`} onClick={() => setSure(v)}>&times;</button>)}
        </div>
      ))}
      <div className="ed-cm-sep" />
      <button className="ed-cm-item" onClick={done(() => void ed.newVersion())}><span className="ed-cm-check" /><span className="ed-cm-label">New version</span></button>
      <button className="ed-cm-item" onClick={done(() => void ed.duplicateVersion())}><span className="ed-cm-check" /><span className="ed-cm-label">Duplicate this version</span></button>
      <button className="ed-cm-item" onClick={done(onRename)}><span className="ed-cm-check" /><span className="ed-cm-label">Rename this version</span></button>
    </Popover>
  )
}

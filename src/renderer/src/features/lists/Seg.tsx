import { useLists } from './lists.store'

/** FILES | PLAYLISTS switch with a sliding pill. Files = where a song lives (one home). Playlists = lists a song can join (many). */
export function Seg() {
  const mode = useLists((s) => s.mode), setMode = useLists((s) => s.setMode)
  return (
    <div className="seg" data-mode={mode} role="tablist">
      <i className="seg-pill" />
      <button role="tab" aria-selected={mode === 'files'} onClick={() => setMode('files')}>FILES</button>
      <button role="tab" aria-selected={mode === 'lists'} onClick={() => setMode('lists')}>PLAYLISTS</button>
    </div>
  )
}

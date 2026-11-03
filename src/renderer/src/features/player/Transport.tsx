import { fmt } from '../../lib/format'
import { usePlayer } from './player.store'
import { useAudioTime } from './useAudioTime'

export function Transport() {
  const { playing, toggle, next, seek } = usePlayer()
  const { t, d } = useAudioTime()
  return (
    <div className="panel">
      <div className="row"><span className="mono">02 / Transport</span><span className="mono">{fmt(t)} / {fmt(d)}</span></div>
      <div className="transport">
        <button className="ghost" onClick={() => next(-1)}>PREV</button>
        <button className="play" onClick={toggle}>{playing ? 'II' : '▶'}</button>
        <button className="ghost" onClick={() => next(1)}>NEXT</button>
        <input type="range" min={0} max={d || 1} step={0.1} value={t} onChange={(e) => seek(+e.target.value)} />
      </div>
    </div>
  )
}

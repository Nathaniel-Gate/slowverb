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
        <button className="play" onClick={toggle}><svg key={String(playing)} className="play-ico" width="18" height="18" viewBox="0 0 18 18" fill="currentColor">{playing ? <><rect x="3.5" y="2.5" width="3.6" height="13" rx="1.2" /><rect x="10.9" y="2.5" width="3.6" height="13" rx="1.2" /></> : <path d="M5 2.8c0-.9 1-1.4 1.7-.9l8 5.2c.6.4.6 1.3 0 1.7l-8 5.2c-.7.5-1.7 0-1.7-.9z" />}</svg></button>
        <button className="ghost" onClick={() => next(1)}>NEXT</button>
        <input type="range" min={0} max={d || 1} step={0.1} value={t} style={{ '--p': `${d ? (t / d) * 100 : 0}%` } as React.CSSProperties} onChange={(e) => seek(+e.target.value)} />
      </div>
    </div>
  )
}

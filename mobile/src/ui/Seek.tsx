import { useState } from 'react'
import { usePlayer } from '../state/player.store'
import { fmtTime } from './format'

/** Touch-friendly seek bar. While a finger is down it shows the finger position and only commits on release, so playback updates do not fight the drag. */
export function Seek() {
  const { pos, dur, seek } = usePlayer()
  const [held, setHeld] = useState<number | null>(null)
  const v = held ?? pos
  const max = Math.max(dur, 0.1)
  const commit = () => { if (held !== null) { seek(held); setHeld(null) } }
  return (
    <div className="seek">
      <input type="range" className="big-range" min={0} max={max} step={0.05} value={Math.min(v, max)} disabled={dur <= 0} aria-label="Seek"
        style={{ '--p': `${(Math.min(v, max) / max) * 100}%` } as React.CSSProperties}
        onChange={(e) => { const t = +e.target.value; if (held === null) seek(t); else setHeld(t) }}
        onPointerDown={() => setHeld(pos)} onPointerUp={commit} onTouchEnd={commit} onPointerCancel={() => setHeld(null)} />
      <div className="row"><span className="mono">{fmtTime(v)}</span><span className="mono">{fmtTime(dur)}</span></div>
    </div>
  )
}

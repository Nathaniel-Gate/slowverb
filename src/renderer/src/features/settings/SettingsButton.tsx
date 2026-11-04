import { useRef, useState } from 'react'
import { Popover } from '../../editor/ui/Popover'
import { useSettings } from './settings.store'

const ROWS: { key: 'playOnClick' | 'playAfterAdd' | 'autoAdvance'; label: string; hint: string }[] = [
  { key: 'playOnClick', label: 'Play when I click a song', hint: 'Off: a click only selects it, press play to start' },
  { key: 'playAfterAdd', label: 'Play after adding or downloading', hint: 'Off: new songs are added without starting' },
  { key: 'autoAdvance', label: 'Play the next song at the end', hint: 'Player view only. The editor view never moves on by itself' }
]

/** Small switch panel for the playback habits above. */
export function SettingsButton() {
  const [open, setOpen] = useState(false), ref = useRef<HTMLButtonElement>(null), s = useSettings()
  return (
    <>
      <button ref={ref} className="ghost" onClick={() => setOpen((o) => !o)} title="Playback settings">SETTINGS</button>
      <Popover anchor={ref} open={open} onClose={() => setOpen(false)} align="right" className="set-pop">
        {ROWS.map((r) => (
          <button key={r.key} className="set-row" role="menuitemcheckbox" aria-checked={s[r.key]} onClick={() => s.set({ [r.key]: !s[r.key] })}>
            <span className="set-sw" data-on={s[r.key] || undefined}><i /></span>
            <span className="set-txt"><b>{r.label}</b><small>{r.hint}</small></span>
          </button>
        ))}
        <div className="set-row set-gap" role="group" aria-label="Silence between songs">
          <span className="set-txt"><b>Silence between songs</b><small>The reverb carries on through it. 0 = straight into the next song</small></span>
          <span className="set-step">
            <button className="ghost" aria-label="Shorter" disabled={s.gapSec <= 0} onClick={() => s.set({ gapSec: Math.max(0, s.gapSec - 1) })}>−</button>
            <span className="mono set-val">{s.gapSec}s</span>
            <button className="ghost" aria-label="Longer" disabled={s.gapSec >= 20} onClick={() => s.set({ gapSec: Math.min(20, s.gapSec + 1) })}>+</button>
          </span>
        </div>
      </Popover>
    </>
  )
}

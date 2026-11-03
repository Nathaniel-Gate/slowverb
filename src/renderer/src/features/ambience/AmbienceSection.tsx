import { AMBIENCE, soundName } from '../../audio/ambience'
import { Knob } from '../fx/Knob'
import { useLibrary } from '../library/library.store'
import { usePlaylists } from '../playlists/playlists.store'
import { useAmbience } from './ambience.store'
import { soundBites } from './soundBites'

/** AMBIENCE block of the Version panel: switch, your Sound bites to layer (each with its own level), master level. */
export function AmbienceSection() {
  const { on, level, sounds, setOn, setLevel, toggleSound, setSoundLevel } = useAmbience()
  const tracks = useLibrary((s) => s.tracks), root = usePlaylists((s) => s.root)
  const bites = soundBites(tracks, root), chosen = sounds.filter((s) => bites.some((b) => b.rel === s.rel))
  return (
    <div className="amb" data-on={on || undefined}>
      <div className="row">
        <span className="mono">Ambience</span>
        <button className="amb-switch" role="switch" aria-checked={on} aria-label="Ambience" title="Your Sound bites, looped under the music while it plays" onClick={() => setOn(!on)}>
          <span className="set-sw" data-on={on || undefined}><i /></span>
        </button>
      </div>
      {bites.length === 0
        ? <p className="amb-empty">Drop sounds into Sound bites to use them here.</p>
        : <>
          <div className="presets amb-types" role="group" aria-label="Sound bites">
            {bites.map((b) => {
              const sel = sounds.some((s) => s.rel === b.rel)
              return <button key={b.rel} className={`chip ${sel ? 'on' : ''}`} aria-pressed={sel} title={b.rel} onClick={() => toggleSound(b.rel)}>{soundName(b.rel)}</button>
            })}
          </div>
          {chosen.length > 0 && (
            <div className="knobs amb-mix">
              {chosen.map((s) => <Knob key={s.rel} label={soundName(s.rel)} value={s.level} text={`${Math.round(s.level)} dB`} min={AMBIENCE.soundMinDb} max={AMBIENCE.soundMaxDb} step={1} onChange={(db) => setSoundLevel(s.rel, db)} />)}
            </div>
          )}
          <Knob label="Ambience level" value={level} text={`${Math.round(level)} dB`} min={AMBIENCE.levelMinDb} max={AMBIENCE.levelMaxDb} step={1} onChange={setLevel} />
        </>}
    </div>
  )
}

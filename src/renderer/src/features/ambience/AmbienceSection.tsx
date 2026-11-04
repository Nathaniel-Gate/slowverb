import { useState } from 'react'
import { categoryOf } from '../../../../shared/libraryModel'
import { AMBIENCE, soundName } from '../../audio/ambience'
import { Knob } from '../fx/Knob'
import { useLibrary } from '../library/library.store'
import { usePlaylists } from '../playlists/playlists.store'
import { useAmbience } from './ambience.store'
import { libraryRels, soundBites } from './soundBites'

/** LAYERS block of the Version panel: switch, quick Sound bite chips, any song added as an extra layer (own level, loop on/off), master level.
 *  New sounds are added through the normal add flow (link box / drop), which asks "Where does this go?". */
export function AmbienceSection() {
  const { on, level, sounds, setOn, setLevel, toggleSound, setSoundLevel, setLoop, addSounds } = useAmbience()
  const tracks = useLibrary((s) => s.tracks), root = usePlaylists((s) => s.root)
  const [pick, setPick] = useState(false), [q, setQ] = useState('')
  const all = libraryRels(tracks, root), bites = soundBites(tracks, root)
  const chosen = sounds.filter((s) => all.some((b) => b.rel === s.rel))
  const rest = all.filter((b) => !sounds.some((s) => s.rel === b.rel) && soundName(b.rel).toLowerCase().includes(q.toLowerCase()))
  return (
    <div className="amb" data-on={on || undefined}>
      <div className="row">
        <span className="mono">Layers</span>
        <button className="amb-switch" role="switch" aria-checked={on} aria-label="Layers" title="Extra sounds and songs played together with the music" onClick={() => setOn(!on)}>
          <span className="set-sw" data-on={on || undefined}><i /></span>
        </button>
      </div>
      {bites.length > 0 && (
        <div className="presets amb-types" role="group" aria-label="Sound bites">
          {bites.map((b) => {
            const sel = sounds.some((s) => s.rel === b.rel)
            return <button key={b.rel} className={`chip ${sel ? 'on' : ''}`} aria-pressed={sel} title={b.rel} onClick={() => toggleSound(b.rel)}>{soundName(b.rel)}</button>
          })}
        </div>
      )}
      {chosen.length > 0 && (
        <div className="amb-mix">
          {chosen.map((s) => {
            const lp = s.loop ?? categoryOf(s.rel) === AMBIENCE.category
            return (
              <div key={s.rel} className="amb-layer">
                <Knob label={soundName(s.rel)} value={s.level} text={`${Math.round(s.level)} dB`} min={AMBIENCE.soundMinDb} max={AMBIENCE.soundMaxDb} step={1} onChange={(db) => setSoundLevel(s.rel, db)} />
                <button className={`chip ${lp ? 'on' : ''}`} aria-pressed={lp} title="Repeat this layer for as long as the music plays" onClick={() => setLoop(s.rel, !lp)}>LOOP</button>
                <button className="chip" aria-label={`Remove ${soundName(s.rel)}`} title="Remove layer" onClick={() => toggleSound(s.rel)}>✕</button>
              </div>
            )
          })}
        </div>
      )}
      <button className="amb-add" onClick={() => setPick(!pick)} aria-expanded={pick}>+ LAYER</button>
      {pick && (
        <div className="amb-pick">
          <input className="amb-link" autoFocus value={q} placeholder="Search your library" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
          <div className="amb-picklist">
            {rest.length === 0 && <p className="amb-empty">Nothing else to add. New sounds: paste a link in the box above the song list and choose Sound bites.</p>}
            {rest.slice(0, 40).map((b) => <button key={b.rel} className="amb-pickrow" onClick={() => { addSounds([b.rel]); setPick(false); setQ('') }}>{soundName(b.rel)}<span className="mono">{categoryOf(b.rel)}</span></button>)}
          </div>
        </div>
      )}
      {all.length > 0 && chosen.length > 0 && <Knob label="Layers level" value={level} text={`${Math.round(level)} dB`} min={AMBIENCE.levelMinDb} max={AMBIENCE.levelMaxDb} step={1} onChange={setLevel} />}
    </div>
  )
}

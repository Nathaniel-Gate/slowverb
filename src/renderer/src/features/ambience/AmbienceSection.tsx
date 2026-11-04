import { useState } from 'react'
import { categoryOf } from '../../../../shared/libraryModel'
import { AMBIENCE, soundName } from '../../audio/ambience'
import { Knob } from '../fx/Knob'
import { useLists } from '../lists/lists.store'
import { useLibrary } from '../library/library.store'
import { usePlaylists } from '../playlists/playlists.store'
import { useAmbience } from './ambience.store'
import { libraryRels, soundBites } from './soundBites'

/** LAYERS block of the Version panel: extra sounds / songs played together with the music, in step with its play / pause.
 *  Each layer: own level, a LOOP switch, and a list of tracks it plays through one after another (a whole playlist can be added). */
export function AmbienceSection() {
  const { on, level, sounds, setOn, setLevel, toggleSound, setSoundLevel, setLoop, addSounds, queueAdd, queueRemove } = useAmbience()
  const tracks = useLibrary((s) => s.tracks), root = usePlaylists((s) => s.root), lists = useLists((s) => s.lists)
  const [pick, setPick] = useState<string | null>(null), [q, setQ] = useState('')   // pick: 'new' = a new layer, else the layer whose list grows
  const all = libraryRels(tracks, root), bites = soundBites(tracks, root)
  const chosen = sounds.filter((s) => all.some((b) => b.rel === s.rel))
  const have = (rel: string) => sounds.some((s) => s.rel === rel)
  const rest = all.filter((b) => (pick !== 'new' || !have(b.rel)) && soundName(b.rel).toLowerCase().includes(q.toLowerCase()))
  const give = (rels: string[]) => {
    if (!rels.length) return
    if (pick === 'new') { addSounds([rels[0]]); if (rels.length > 1) queueAdd(rels[0], rels.slice(1)) } else if (pick) queueAdd(pick, rels)
    setPick(null); setQ('')
  }
  const picker = (
    <div className="amb-pick">
      <input className="amb-link" autoFocus value={q} placeholder="Search your library" spellCheck={false} onChange={(e) => setQ(e.target.value)} />
      <div className="amb-picklist">
        {!q && lists.filter((l) => l.songs.length).map((l) => <button key={l.id} className="amb-pickrow" onClick={() => give(l.songs.filter((r) => all.some((b) => b.rel === r)))}>Playlist: {l.name}<span className="mono">{l.songs.length} songs</span></button>)}
        {rest.length === 0 && <p className="amb-empty">Nothing to add. New sounds: paste a link in the box above the song list.</p>}
        {rest.slice(0, 40).map((b) => <button key={b.rel} className="amb-pickrow" onClick={() => give([b.rel])}>{soundName(b.rel)}<span className="mono">{categoryOf(b.rel)}</span></button>)}
      </div>
    </div>
  )
  return (
    <div className="amb" data-on={on || undefined}>
      <div className="row">
        <span className="mono">Layers</span>
        <button className="amb-switch" role="switch" aria-checked={on} aria-label="Layers" title="Extra sounds and songs played together with the music, pausing and playing with it" onClick={() => setOn(!on)}>
          <span className="set-sw" data-on={on || undefined}><i /></span>
        </button>
      </div>
      {bites.length > 0 && (
        <div className="presets amb-types" role="group" aria-label="Sound bites">
          {bites.map((b) => <button key={b.rel} className={`chip ${have(b.rel) ? 'on' : ''}`} aria-pressed={have(b.rel)} title={b.rel} onClick={() => toggleSound(b.rel)}>{soundName(b.rel)}</button>)}
        </div>
      )}
      {chosen.map((s) => {
        const lp = s.loop ?? (!!s.queue?.length || categoryOf(s.rel) === AMBIENCE.category)
        return (
          <div key={s.rel} className="amb-layer-box">
            <div className="amb-layer">
              <Knob label={soundName(s.rel)} value={s.level} text={`${Math.round(s.level)} dB`} min={AMBIENCE.soundMinDb} max={AMBIENCE.soundMaxDb} step={1} onChange={(db) => setSoundLevel(s.rel, db)} />
              <button className={`chip ${lp ? 'on' : ''}`} aria-pressed={lp} title="Start this layer over when it reaches the end" onClick={() => setLoop(s.rel, !lp)}>LOOP</button>
              <button className="chip" aria-label={`Remove ${soundName(s.rel)}`} title="Remove layer" onClick={() => toggleSound(s.rel)}>✕</button>
            </div>
            {(s.queue ?? []).map((r, i) => (
              <div key={i} className="amb-q"><span>{i + 2}. {soundName(r)}</span><button className="chip" aria-label="Remove from list" onClick={() => queueRemove(s.rel, i)}>✕</button></div>
            ))}
            <button className="chip amb-next" onClick={() => { setPick(pick === s.rel ? null : s.rel); setQ('') }}>+ NEXT TRACK OR PLAYLIST</button>
            {pick === s.rel && picker}
          </div>
        )
      })}
      <button className="amb-add" onClick={() => { setPick(pick === 'new' ? null : 'new'); setQ('') }} aria-expanded={pick === 'new'}>+ LAYER</button>
      {pick === 'new' && picker}
      {chosen.length > 0 && <Knob label="Layers level" value={level} text={`${Math.round(level)} dB`} min={AMBIENCE.levelMinDb} max={AMBIENCE.levelMaxDb} step={1} onChange={setLevel} />}
    </div>
  )
}

import { AMBIENCE, soundName } from '@app/audio/ambience'
import { Knob } from '@app/features/fx/Knob'
import { CATEGORIES } from '@shared/config'
import { useState } from 'react'
import { useAmbience } from '../state/ambience.store'
import { useLibrary } from '../state/library.store'
import { useLists } from '../state/lists.store'
import { catOf, songRel, songsOfList } from '../state/model'
import { LayerPicker } from './LayerPicker'

/** LAYERS block of Now Playing: extra tracks played together with the music, in step with its play / pause (paused = frozen, resumes where it was).
 *  Each layer: own level, LOOP, and a queue of more tracks played after it (a whole playlist can be added). Same model as the Mac app. */
export function LayersPanel() {
  const { on, level, sounds, setOn, setLevel, toggleSound, setSoundLevel, setLoop, addSounds, queueAdd, queueRemove } = useAmbience()
  const songs = useLibrary((s) => s.songs), lists = useLists((s) => s.lists)
  const [pick, setPick] = useState<string | 'new' | null>(null)   // 'new' = a new layer, else the layer whose queue grows
  const byRel = new Map(songs.map((s) => [songRel(s), s]))
  const nameOf = (rel: string) => byRel.get(rel)?.title ?? soundName(rel)
  const here = sounds.filter((s) => byRel.has(s.rel))
  const give = (rels: string[]) => {
    if (!rels.length) return
    if (pick === 'new') { addSounds([rels[0]]); if (rels.length > 1) queueAdd(rels[0], rels.slice(1)) } else if (pick) queueAdd(pick, rels)
    setPick(null)
  }
  return (
    <section className="panel layers" data-on={on || undefined}>
      <div className="row"><span className="mono">LAYERS</span>
        <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label="Layers" onClick={() => setOn(!on)}><i /></button></div>
      <p className="set-note">Extra sounds played together with the music. They pause and play with it.</p>
      {here.map((s) => {
        const song = byRel.get(s.rel)!, lp = s.loop ?? (!!s.queue?.length || catOf(song) === AMBIENCE.category)
        return (
          <div key={s.rel} className="layer">
            <div className="layer-top">
              <div className="layer-knob"><Knob label={nameOf(s.rel)} value={s.level} text={`${Math.round(s.level)} dB`} min={AMBIENCE.soundMinDb} max={AMBIENCE.soundMaxDb} step={1} onChange={(db) => setSoundLevel(s.rel, db)} /></div>
              <button className={`chip ${lp ? 'on' : ''}`} aria-pressed={lp} onClick={() => setLoop(s.rel, !lp)}>LOOP</button>
              <button className="chip" aria-label={`Remove ${nameOf(s.rel)}`} onClick={() => toggleSound(s.rel)}>{'✕'}</button>
            </div>
            {(s.queue ?? []).map((r, i) => (
              <div key={`${r}${i}`} className="layer-q"><span>{i + 2}. {nameOf(r)}</span><button className="chip" aria-label="Remove from list" onClick={() => queueRemove(s.rel, i)}>{'✕'}</button></div>
            ))}
            <button className="chip layer-next" onClick={() => setPick(pick === s.rel ? null : s.rel)}>+ NEXT TRACK OR PLAYLIST</button>
          </div>
        )
      })}
      <button className="chip layer-add" onClick={() => setPick('new')}>+ LAYER</button>
      {here.length > 0 && <Knob label="LAYERS LEVEL" value={level} text={`${Math.round(level)} dB`} min={AMBIENCE.levelMinDb} max={AMBIENCE.levelMaxDb} step={1} onChange={setLevel} />}
      {pick && <LayerPicker songs={songs} lists={lists.map((l) => ({ id: l.id, name: l.name, rels: songsOfList(songs, l).map(songRel) })).filter((l) => l.rels.length)}
        order={[AMBIENCE.category, ...CATEGORIES.filter((c) => c !== AMBIENCE.category)]} hide={pick === 'new' ? sounds.map((s) => s.rel) : []} onPick={give} onClose={() => setPick(null)} />}
    </section>
  )
}

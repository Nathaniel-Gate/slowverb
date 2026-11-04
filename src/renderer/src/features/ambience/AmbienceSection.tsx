import { useRef, useState } from 'react'
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
  const pick = useRef<HTMLInputElement>(null)
  const addFiles = async (fs: FileList | null) => {
    const paths = [...(fs ?? [])].map((f) => window.api.pathFor(f)).filter(Boolean)
    if (paths.length) await usePlaylists.getState().importFiles(paths, AMBIENCE.category)
    if (pick.current) pick.current.value = ''
  }
  const [link, setLink] = useState(''), [msg, setMsg] = useState('')
  const fetchLink = async () => {
    const l = link.trim(); if (!l || msg === 'Downloading…') return
    setMsg('Downloading…')
    const r = await window.api.download(l, AMBIENCE.category)
    if (r.paths?.length) { await usePlaylists.getState().refresh(); setLink(''); setMsg('Added to Sound bites') }
    else setMsg(r.error ?? 'Failed')
  }
  const bites = soundBites(tracks, root), chosen = sounds.filter((s) => bites.some((b) => b.rel === s.rel))
  return (
    <div className="amb" data-on={on || undefined}>
      <div className="row">
        <span className="mono">Ambience</span>
        <button className="amb-switch" role="switch" aria-checked={on} aria-label="Ambience" title="Your Sound bites, looped under the music while it plays" onClick={() => setOn(!on)}>
          <span className="set-sw" data-on={on || undefined}><i /></span>
        </button>
      </div>
      <input ref={pick} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg" multiple hidden onChange={(e) => void addFiles(e.target.files)} />
      <div className="amb-addrow">
        <input className="amb-link" value={link} placeholder="Paste a link to a rain / white noise sound" spellCheck={false} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void fetchLink()} />
        <button className="amb-add" disabled={!link.trim() || msg === 'Downloading…'} onClick={() => void fetchLink()}>ADD</button>
        <button className="amb-add" onClick={() => pick.current?.click()} title="Choose audio files from your Mac">FILE…</button>
      </div>
      {msg && <p className="amb-empty">{msg}</p>}
      {bites.length === 0
        ? <p className="amb-empty">No sounds yet. Add a rain, birdsong or white noise file.</p>
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

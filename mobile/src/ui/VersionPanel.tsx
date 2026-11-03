import { useRef, useState } from 'react'
import { REVERB, SPEED } from '@app/config/fx'
import { allPresets, useFx } from '@app/features/fx/fx.store'
import { Knob } from '@app/features/fx/Knob'
import { UI } from './config'

/** Version chips (presets + saved), A/B original, and the four sliders. Edits go to useFx; the player store saves them per song. */
export function VersionPanel() {
  const { fx, preset, bypass, userPresets, set, applyPreset, toggleBypass, saveUserPreset, deleteUserPreset } = useFx()
  const [naming, setNaming] = useState(false), [name, setName] = useState('')
  const hold = useRef(0)
  const save = () => { saveUserPreset(name); setNaming(false); setName('') }
  const isUser = (n: string) => userPresets.some((u) => u.name === n)
  const press = (n: string) => { window.clearTimeout(hold.current); if (isUser(n)) hold.current = window.setTimeout(() => deleteUserPreset(n), UI.longPressMs * 2) }
  const release = () => window.clearTimeout(hold.current)
  return (
    <section className="panel version">
      <div className="row"><span className="mono">VERSION</span>
        <button className={`ab ${bypass ? 'on' : ''}`} onClick={toggleBypass} aria-pressed={bypass}>{bypass ? 'ORIGINAL' : 'A/B ORIGINAL'}</button></div>
      <div className="chips">
        {allPresets(userPresets).map((p) => (
          <button key={p.name} className={`chip ${preset === p.name ? 'on' : ''}`} onClick={() => applyPreset(p.name)}
            onPointerDown={() => press(p.name)} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onContextMenu={(e) => e.preventDefault()}>{p.name}</button>
        ))}
        {naming
          ? <span className="chip-save"><input autoFocus value={name} placeholder="name" maxLength={24} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} /><button className="chip on" onClick={save}>SAVE</button></span>
          : <button className="chip" onClick={() => setNaming(true)}>+ SAVE</button>}
      </div>
      {userPresets.length > 0 && <div className="mono hint">HOLD A SAVED VERSION TO DELETE IT</div>}
      <div className={`knobs-col ${bypass ? 'dim' : ''}`}>
        <Knob label="SPEED" value={fx.speed} text={`${fx.speed.toFixed(2)}x`} {...SPEED} onChange={(speed) => set({ speed })} />
        <Knob label="REVERB MIX" value={fx.wet} text={`${Math.round(fx.wet * 100)}%`} min={0} max={1} step={0.01} onChange={(wet) => set({ wet })} />
        <Knob label="REVERB LENGTH" value={fx.decay} text={`${fx.decay.toFixed(1)}s`} min={REVERB.decayMin} max={REVERB.decayMax} step={0.1} onChange={(decay) => set({ decay })} />
        <Knob label="REVERB DARKNESS" value={fx.damping} text={`${Math.round(fx.damping * 100)}%`} min={0} max={1} step={0.01} onChange={(damping) => set({ damping })} />
      </div>
      <div className="row pitch"><span className="mono">PITCH FOLLOWS SPEED</span>
        <button className={`switch ${!fx.pitchLock ? 'on' : ''}`} role="switch" aria-checked={!fx.pitchLock} aria-label="Pitch follows speed" onClick={() => set({ pitchLock: !fx.pitchLock })}><i /></button></div>
    </section>
  )
}

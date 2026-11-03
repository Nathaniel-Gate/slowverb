import { useState } from 'react'
import { REVERB, SPEED } from '../../config/fx'
import { allPresets, useFx } from './fx.store'
import { Knob } from './Knob'
import { ExportButton } from '../export/ExportButton'
import { PhoneButton } from '../export/PhoneButton'
import { AmbienceSection } from '../ambience/AmbienceSection'

export function FxPanel() {
  const { fx, preset, bypass, userPresets, set, applyPreset, toggleBypass, saveUserPreset, deleteUserPreset } = useFx()
  const [naming, setNaming] = useState(false), [name, setName] = useState('')
  const save = () => { saveUserPreset(name); setNaming(false); setName('') }
  return (
    <div className="panel">
      <div className="row"><span className="mono">03 / Version</span>
        <button className={`ghost ${bypass ? 'on' : ''}`} onClick={toggleBypass} title="B">{bypass ? 'ORIGINAL (B)' : 'A/B ORIGINAL'}</button></div>
      <div className="presets">
        {allPresets(userPresets).map((p) => (
          <button key={p.name} className={`chip ${preset === p.name ? 'on' : ''}`} onClick={() => applyPreset(p.name)}
            onContextMenu={(e) => { e.preventDefault(); if (userPresets.some((u) => u.name === p.name)) deleteUserPreset(p.name) }}>{p.name}</button>
        ))}
        {naming
          ? <input autoFocus className="chip name" value={name} placeholder="name, Enter" onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} onBlur={() => setNaming(false)} />
          : <button className="chip" onClick={() => setNaming(true)}>+ Save</button>}
      </div>
      <div className="knobs">
      <Knob label="Speed" value={fx.speed} text={`${fx.speed.toFixed(2)}x`} {...SPEED} onChange={(speed) => set({ speed })} />
      <Knob label="Reverb mix" value={fx.wet} text={`${Math.round(fx.wet * 100)}%`} min={0} max={1} step={0.01} onChange={(wet) => set({ wet })} />
      <Knob label="Reverb length" value={fx.decay} text={`${fx.decay.toFixed(1)}s`} min={REVERB.decayMin} max={REVERB.decayMax} step={0.1} onChange={(decay) => set({ decay })} />
      <Knob label="Reverb darkness" value={fx.damping} text={`${Math.round(fx.damping * 100)}%`} min={0} max={1} step={0.01} onChange={(damping) => set({ damping })} />
      </div>
      <div className="row" style={{ marginTop: 18 }}>
        <span className="mono">Pitch follows speed</span>
        <button className={`ghost ${!fx.pitchLock ? 'on' : ''}`} onClick={() => set({ pitchLock: !fx.pitchLock })}>{fx.pitchLock ? 'OFF (locked)' : 'ON'}</button>
      </div>
      <AmbienceSection />
      <div className="row" style={{ marginTop: 14 }}><span className="mono">Save this version</span><ExportButton /></div>
      <div className="row" style={{ marginTop: 8 }}><span className="mono">Your phone</span><PhoneButton /></div>
    </div>
  )
}

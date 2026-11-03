import type { Fx } from '../../../../../shared/types'
import { DEFAULT_FX, REVERB, SPEED } from '../../../config/fx'
import { PRESETS } from '../../../config/presets'
import { Knob } from '../../../features/fx/Knob'
import { useEditor } from '../../editor.store'
import { MasterMeter } from '../MasterMeter'
import { usePanels } from './panels.store'

const same = (a: Fx, b: Fx) => a.speed === b.speed && a.wet === b.wet && a.decay === b.decay && a.damping === b.damping && a.pitchLock === b.pitchLock

/** The whole-mix Version (speed + reverb), applied after every clip. null master = bypassed (A/B original). */
export function Mix() {
  const master = useEditor((s) => (s.project ? s.project.master : undefined)), stash = usePanels((s) => s.stash)
  const bypass = master === null, fx = master ?? stash ?? DEFAULT_FX
  const set = (patch: Partial<Fx>) => useEditor.getState().applyMaster({ ...fx, ...patch })
  const toggleBypass = () => {
    if (bypass) { useEditor.getState().applyMaster(stash ?? DEFAULT_FX); return }
    usePanels.getState().set({ stash: master ?? DEFAULT_FX }); useEditor.getState().applyMaster(null)
  }
  return (
    <div className="dk-stack">
      <div className="row"><span className="mono">MASTER VERSION</span>
        <button className={`ghost ${bypass ? 'on' : ''}`} onClick={toggleBypass} title="Hear the mix without speed and reverb">{bypass ? 'ORIGINAL' : 'A/B ORIGINAL'}</button></div>
      <div className="presets" style={{ marginTop: 0 }}>
        {PRESETS.map((p) => <button key={p.name} className={`chip ${!bypass && same(p.fx, fx) ? 'on' : ''}`} onClick={() => useEditor.getState().applyMaster(p.fx)}>{p.name}</button>)}
      </div>
      <div className={`dk-knobs ${bypass ? 'dim' : ''}`}>
        <Knob label="Speed" value={fx.speed} text={`${fx.speed.toFixed(2)}x`} {...SPEED} onChange={(speed) => set({ speed })} />
        <Knob label="Reverb mix" value={fx.wet} text={`${Math.round(fx.wet * 100)}%`} min={0} max={1} step={0.01} onChange={(wet) => set({ wet })} />
        <Knob label="Reverb length" value={fx.decay} text={`${fx.decay.toFixed(1)}s`} min={REVERB.decayMin} max={REVERB.decayMax} step={0.1} onChange={(decay) => set({ decay })} />
        <Knob label="Reverb darkness" value={fx.damping} text={`${Math.round(fx.damping * 100)}%`} min={0} max={1} step={0.01} onChange={(damping) => set({ damping })} />
      </div>
      <div className="row"><span className="mono">Pitch follows speed</span>
        <button className={`ghost ${!fx.pitchLock ? 'on' : ''}`} onClick={() => set({ pitchLock: !fx.pitchLock })}>{fx.pitchLock ? 'OFF (locked)' : 'ON'}</button></div>
      <MasterMeter />
    </div>
  )
}

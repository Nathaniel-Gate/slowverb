import type { Fx } from '../../../../../shared/types'
import { DEFAULT_FX, REVERB, SPEED } from '../../../config/fx'
import { PRESETS } from '../../../config/presets'
import { Knob } from '../../../features/fx/Knob'
import { useEditor } from '../../editor.store'
import { masterOf } from '../../master'
import { useFx } from '../../../features/fx/fx.store'
import { useLibrary } from '../../../features/library/library.store'
import { MasterMeter } from '../MasterMeter'
import { usePanels } from './panels.store'

const same = (a: Fx, b: Fx) => a.speed === b.speed && a.wet === b.wet && a.decay === b.decay && a.damping === b.damping && a.pitchLock === b.pitchLock

/** The whole-mix Version (speed + reverb), applied after every clip. null master = bypassed (A/B original). */
export function Mix() {
  const project = useEditor((s) => s.project), stash = usePanels((s) => s.stash)
  useFx((s) => s.fx); useFx((s) => s.bypass); useLibrary((s) => s.tracks)          // re-render when the followed player version changes
  const master = project ? project.master : undefined, following = master === null
  const fx = project ? masterOf(project) : DEFAULT_FX
  const bypass = !following && !!master && same(master, DEFAULT_FX)
  const set = (patch: Partial<Fx>) => useEditor.getState().applyMaster({ ...fx, ...patch })
  const toggleBypass = () => {
    if (bypass) { useEditor.getState().applyMaster(stash ?? null); return }
    usePanels.getState().set({ stash: master ?? null }); useEditor.getState().applyMaster({ ...DEFAULT_FX })
  }
  return (
    <div className="dk-stack">
      <div className="row"><span className="mono">MASTER VERSION</span>
        <button className={`ghost ${following ? 'on' : ''}`} onClick={() => useEditor.getState().applyMaster(null)} title="Use the same speed and reverb as the player view for this song">{following ? 'FOLLOWING PLAYER' : 'FOLLOW PLAYER'}</button>
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

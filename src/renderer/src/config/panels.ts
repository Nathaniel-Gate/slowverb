// Docked panels (Inspector, Source bin, Markers, Mix, BPM) and the master meter. Every tunable lives here.
export type DockTab = 'inspector' | 'source' | 'markers' | 'mix' | 'bpm'
export const DOCK_TABS: { id: DockTab; label: string; short: string }[] = [
  { id: 'inspector', label: 'INSPECT', short: 'I' }, { id: 'source', label: 'SOURCE', short: 'S' }, { id: 'markers', label: 'MARKS', short: 'M' },
  { id: 'mix', label: 'MIX', short: 'X' }, { id: 'bpm', label: 'BPM', short: 'B' }
]
// Label / marker colour keys (Clip.label, Marker.color). The only colour in an otherwise greyscale app, kept muted.
import { LABELS as TL_LABELS } from './timeline'
export const LABELS: { key: string; css: string }[] = TL_LABELS.filter((l) => l.key !== 'none').map((l) => ({ key: l.key, css: l.color }))   // one palette, defined in config/timeline.ts
export const PANELS = {
  closeMs: 260,              // matches --t: how long the dock keeps its width while its exit animation plays
  gainMinDb: -60, gainMaxDb: 12, gainStepDb: 0.1,
  speedMinPct: 25, speedMaxPct: 400, speedChips: [50, 75, 100, 125, 150, 200],
  fadeMaxSec: 60, fadeStep: 0.05,
  timeStep: 0.01,            // arrow-key step in a time field, seconds (Shift x10)
  normTargetDb: -1, normMode: 'peak' as 'peak' | 'rms',
  miniWaveH: 64, miniWaveMinSec: 0.05, sourceCacheMax: 4, auditionTick: true,
  bpmMin: 40, bpmMax: 240, bpmLowConfidence: 0.3, tapResetSec: 2.2, tapKeep: 8, offsetStep: 0.01,
  meterFloorDb: -60, meterTicksDb: [-48, -24, -12, -6, 0], meterClipAt: 0.999
}

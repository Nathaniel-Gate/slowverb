import { CLIPS } from '../config/clips'
import type { Command } from '../editor/commands'
import type { S } from '../editor/storeTypes'
import { patchVisual, setAspect, type VisualPatch } from './opsVisual'

// Clips-tab entries for the command palette (and rebindable keys). Every other editor command already works on visual clips.
const visual = (s: S) => s.view === 'visual'
const sel = (s: S, patch: VisualPatch, ok: string) => {
  if (!s.selection.length) return s.showToast('Select a picture or video first')
  const before = s.project; s.apply((p) => patchVisual(p, s.selection, patch))
  s.showToast(before === s.project ? 'Nothing changed' : ok)
}
const c = (id: string, label: string, run: Command['run'], when: Command['when'] = visual): Command => ({ id, label, group: 'Clips', keys: [], run, when })

export const CLIPS_COMMANDS: Command[] = [
  c('clips.open', 'Show the Clips tab (pictures and video)', (s) => s.setView('visual'), (s) => s.view !== 'visual'),
  c('clips.editor', 'Show the Editor tab (audio)', (s) => s.setView('audio')),
  c('clips.fill', 'Picture: fill the frame', (s) => sel(s, { fit: 'cover' }, 'Fill the frame')),
  c('clips.whole', 'Picture: show the whole picture', (s) => sel(s, { fit: 'contain' }, 'Whole picture')),
  c('clips.pushIn', 'Picture: slow push-in (10%)', (s) => sel(s, { zoom: 0.1 }, 'Push-in 10%')),
  c('clips.pushOff', 'Picture: no push-in', (s) => sel(s, { zoom: 0 }, 'Push-in off')),
  c('clips.soundOn', 'Video: include its own sound', (s) => sel(s, { audio: true }, 'Video sound on')),
  c('clips.soundOff', 'Video: pictures only (no sound)', (s) => sel(s, { audio: false }, 'Video sound off')),
  c('clips.media', 'Open the media browser', (s) => s.setDock('media')),
  ...CLIPS.aspects.map((a) => c(`clips.aspect.${a}`, `Preview frame ${a}`, (s) => { s.apply((p) => setAspect(p, a)); s.showToast(`Frame ${a}`) }))
]

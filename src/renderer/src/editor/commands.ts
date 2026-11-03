import { create } from 'zustand'
import { DEFAULT_KEYS, EDITOR } from '../config/editorKeys'
import { comboId, eventCombo, keyId } from './keyparse'
import { projectEnd, type Tool } from './model'
import { editPoints } from './ops'
import { useOverlay } from './overlayStore'
import type { S } from './storeTypes'

/** One thing the editor can do. Drives the keys, the command palette, context menus and the shortcuts dialog. */
export type Command = { id: string; label: string; group: string; keys: string[]; run: (s: S) => void; when?: (s: S) => boolean; repeat?: boolean }
/** A context-menu row. `keys` is display text (use formatKey). */
export type MenuItem = { label: string; keys?: string; run?: () => void; disabled?: boolean; checked?: boolean; sep?: boolean; danger?: boolean }

const cmd = (id: string, label: string, group: string, run: Command['run'], extra: Partial<Command> = {}): Command => ({ id, label, group, keys: DEFAULT_KEYS[id] ?? [], run, ...extra })
const hasRange = (s: S) => s.markIn !== null && s.markOut !== null && s.markOut > s.markIn
const hasSel = (s: S) => s.selection.length > 0
const edge = (s: S, dir: 1 | -1) => {
  if (!s.project) return
  const t = s.now(), pts = editPoints(s.project), hit = dir > 0 ? pts.find((p) => p > t + EDITOR.edgeEps) : [...pts].reverse().find((p) => p < t - EDITOR.edgeEps)
  s.gotoTime(hit ?? (dir > 0 ? projectEnd(s.project) : 0))
}
const marker = (s: S, dir: 1 | -1) => {
  const t = s.now(), ms = s.project?.markers ?? [], hit = dir > 0 ? ms.find((m) => m.t > t + EDITOR.edgeEps) : [...ms].reverse().find((m) => m.t < t - EDITOR.edgeEps)
  if (hit) s.gotoTime(hit.t); else s.showToast('No more markers')
}
const TOOLS: [string, string][] = [['select', 'Select'], ['razor', 'Razor'], ['ripple', 'Ripple trim'], ['slip', 'Slip'], ['hand', 'Hand'], ['zoom', 'Zoom'], ['roll', 'Rolling edit'], ['rate', 'Rate stretch']]
const DOCKS = [['inspector', 'Inspector'], ['source', 'Source bin'], ['markers', 'Markers'], ['mix', 'Mix'], ['bpm', 'BPM']] as const
const rep = { repeat: true }

export const COMMANDS: Command[] = [
  ...TOOLS.map(([id, label]) => cmd(`tool.${id}`, `${label} tool`, 'Tools', (s) => s.setTool(id as Tool))),
  cmd('play', 'Play / pause', 'Playback', (s) => void s.togglePlay()),
  cmd('playRange', 'Play In to Out', 'Playback', (s) => s.playRange(), { when: hasRange }),
  cmd('loop', 'Toggle loop', 'Playback', (s) => s.toggleLoop()),
  cmd('shuttle.back', 'Shuttle backward (tap for faster)', 'Playback', (s) => s.shuttleKey(-1)),
  cmd('shuttle.stop', 'Shuttle stop', 'Playback', (s) => s.shuttleKey(0)),
  cmd('shuttle.fwd', 'Shuttle forward (tap for faster)', 'Playback', (s) => s.shuttleKey(1)),
  cmd('step.back', 'Step back 0.1s', 'Playback', (s) => s.setPlayhead(s.now() - EDITOR.nudgeSec), rep),
  cmd('step.fwd', 'Step forward 0.1s', 'Playback', (s) => s.setPlayhead(s.now() + EDITOR.nudgeSec), rep),
  cmd('step.backBig', 'Step back 1s', 'Playback', (s) => s.setPlayhead(s.now() - EDITOR.nudgeBigSec), rep),
  cmd('step.fwdBig', 'Step forward 1s', 'Playback', (s) => s.setPlayhead(s.now() + EDITOR.nudgeBigSec), rep),
  cmd('edit.prev', 'Previous edit point', 'Playback', (s) => edge(s, -1)),
  cmd('edit.next', 'Next edit point', 'Playback', (s) => edge(s, 1)),
  cmd('home', 'Go to start', 'Playback', (s) => s.gotoTime(0)),
  cmd('end', 'Go to end', 'Playback', (s) => s.project && s.gotoTime(projectEnd(s.project))),

  cmd('split', 'Add edit (selected clips)', 'Edit', (s) => s.splitAtPlayhead()),
  cmd('splitAll', 'Add edit to all tracks', 'Edit', (s) => s.splitAllAtPlayhead()),
  cmd('trim.headRipple', 'Ripple trim start to playhead', 'Edit', (s) => s.trimToPlayhead('nextHead', true)),
  cmd('trim.tailRipple', 'Ripple trim end to playhead', 'Edit', (s) => s.trimToPlayhead('prevTail', true)),
  cmd('trim.head', 'Trim start to playhead', 'Edit', (s) => s.trimToPlayhead('nextHead', false)),
  cmd('trim.tail', 'Trim end to playhead', 'Edit', (s) => s.trimToPlayhead('prevTail', false)),
  cmd('delete', 'Delete', 'Edit', (s) => s.deleteSelection(false), { when: hasSel }),
  cmd('rippleDelete', 'Ripple delete / close gap', 'Edit', (s) => (s.gap ? s.closeGapAtSelection() : s.deleteSelection(true)), { when: (s) => hasSel(s) || !!s.gap }),
  cmd('lift', 'Lift In to Out', 'Edit', (s) => s.liftRange(), { when: hasRange }),
  cmd('extract', 'Extract In to Out', 'Edit', (s) => s.extractRange(), { when: hasRange }),
  cmd('closeGaps', 'Close all gaps', 'Edit', (s) => s.closeAllGaps()),
  cmd('crossfade', 'Crossfade at cut', 'Edit', (s) => s.crossfadeSelection()),
  cmd('uncrossfade', 'Remove crossfade', 'Edit', (s) => s.uncrossfadeSelection()),
  cmd('repeat', 'Repeat selection', 'Edit', (s) => s.repeatSelection(1), { when: hasSel }),
  cmd('disable', 'Enable / disable clip', 'Edit', (s) => s.toggleDisable(), { when: hasSel }),
  cmd('nudge.back', 'Nudge clip left', 'Edit', (s) => s.nudge(-EDITOR.nudgeClipSec), { ...rep, when: hasSel }),
  cmd('nudge.fwd', 'Nudge clip right', 'Edit', (s) => s.nudge(EDITOR.nudgeClipSec), { ...rep, when: hasSel }),
  cmd('nudge.backBig', 'Nudge clip left x10', 'Edit', (s) => s.nudge(-EDITOR.nudgeClipSec * EDITOR.nudgeClipBigMul), { ...rep, when: hasSel }),
  cmd('nudge.fwdBig', 'Nudge clip right x10', 'Edit', (s) => s.nudge(EDITOR.nudgeClipSec * EDITOR.nudgeClipBigMul), { ...rep, when: hasSel }),
  cmd('undo', 'Undo', 'Edit', (s) => s.undo(), { ...rep, when: (s) => !!s.hist?.past.length }),
  cmd('redo', 'Redo', 'Edit', (s) => s.redo(), { ...rep, when: (s) => !!s.hist?.future.length }),

  cmd('selectAll', 'Select all', 'Selection', (s) => s.selectAll()),
  cmd('deselect', 'Deselect', 'Selection', (s) => { s.select([]); s.selectGap(null) }),
  cmd('selectFwd', 'Select forward from playhead', 'Selection', (s) => s.selectForward()),
  cmd('selectBack', 'Select backward from playhead', 'Selection', (s) => s.selectBackward()),
  cmd('copy', 'Copy', 'Clipboard', (s) => s.copy(), { when: hasSel }),
  cmd('cut', 'Cut', 'Clipboard', (s) => s.cut(), { when: hasSel }),
  cmd('paste', 'Paste (overwrite)', 'Clipboard', (s) => s.paste(), { when: (s) => s.clipboard.length > 0 }),
  cmd('pasteInsert', 'Paste insert', 'Clipboard', (s) => s.pasteInsert(), { when: (s) => s.clipboard.length > 0 }),

  cmd('markIn', 'Mark In', 'Range and markers', (s) => s.setMark('in', s.now())),
  cmd('markOut', 'Mark Out', 'Range and markers', (s) => s.setMark('out', s.now())),
  cmd('gotoIn', 'Go to In', 'Range and markers', (s) => s.markIn !== null && s.gotoTime(s.markIn)),
  cmd('gotoOut', 'Go to Out', 'Range and markers', (s) => s.markOut !== null && s.gotoTime(s.markOut)),
  cmd('clearIn', 'Clear In', 'Range and markers', (s) => s.setMark('in', null)),
  cmd('clearOut', 'Clear Out', 'Range and markers', (s) => s.setMark('out', null)),
  cmd('clearMarks', 'Clear In and Out', 'Range and markers', (s) => { s.setMark('in', null); s.setMark('out', null) }),
  cmd('marker', 'Add marker', 'Range and markers', (s) => s.addMarkerAtPlayhead()),
  cmd('marker.next', 'Next marker', 'Range and markers', (s) => marker(s, 1)),
  cmd('marker.prev', 'Previous marker', 'Range and markers', (s) => marker(s, -1)),

  cmd('snap', 'Toggle snap', 'View', (s) => s.toggleSnap()),
  cmd('beatSnap', 'Toggle beat snap', 'View', (s) => s.toggleBeatSnap()),
  cmd('showBeats', 'Show beat grid', 'View', (s) => s.toggleShowBeats()),
  cmd('fit', 'Zoom to fit project', 'View', (s) => s.fitToView(s.viewWidth || 1000)),
  cmd('fitSelection', 'Zoom to selection', 'View', (s) => s.fitSelection()),
  cmd('zoomIn', 'Zoom in', 'View', (s) => s.setZoom(s.pxPerSec * EDITOR.zoomStep, s.now()), rep),
  cmd('zoomOut', 'Zoom out', 'View', (s) => s.setZoom(s.pxPerSec / EDITOR.zoomStep, s.now()), rep),
  ...DOCKS.map(([id, label]) => cmd(`dock.${id}`, `Show ${label}`, 'Panels', (s) => s.setDock(id))),
  cmd('dock.hide', 'Hide panels', 'Panels', (s) => s.setDock(null)),

  cmd('save', 'Save now', 'Project', (s) => void s.flush().then(() => s.showToast('Saved'))),
  cmd('render', 'Render to library', 'Project', (s) => void s.renderToLibrary()),
  cmd('version.new', 'New version', 'Project', (s) => void s.newVersion()),
  cmd('edit.reset', 'Reset to original (one clip)', 'Edit', (s) => s.resetToOriginal()),
  cmd('version.duplicate', 'Duplicate version', 'Project', (s) => void s.duplicateVersion()),
  cmd('syncLock', 'Toggle sync lock', 'Project', (s) => s.toggleSyncLock()),
  cmd('history', 'Undo history', 'Project', () => { const o = useOverlay.getState(); o.set({ history: !o.history }) }),
  cmd('palette', 'Command palette', 'App', () => { const o = useOverlay.getState(); o.set({ palette: !o.palette, shortcuts: false }) }),
  cmd('shortcuts', 'Keyboard shortcuts', 'App', () => useOverlay.getState().set({ shortcuts: true, palette: false }))
]
const byId = new Map(COMMANDS.map((c) => [c.id, c]))
export const getCommand = (id: string) => byId.get(id)

// ---- user key overrides (id -> keys; [] = unbound), persisted -------------------------------------------------------
const load = (): Record<string, string[]> => { try { return JSON.parse(localStorage.getItem(EDITOR.keysStorage) || '{}') } catch { return {} } }
const save = (o: Record<string, string[]>) => { try { localStorage.setItem(EDITOR.keysStorage, JSON.stringify(o)) } catch { /* storage may be blocked */ } }
type K = { overrides: Record<string, string[]>; setKeys(id: string, keys: string[]): void; reset(id: string): void; resetAll(): void }
export const useKeymap = create<K>((set, get) => ({
  overrides: load(),
  setKeys: (id, keys) => { const o = { ...get().overrides, [id]: keys }; save(o); set({ overrides: o }) },
  reset: (id) => { const { [id]: _drop, ...o } = get().overrides; save(o); set({ overrides: o }) },
  resetAll: () => { save({}); set({ overrides: {} }) }
}))
export const keysOf = (id: string, overrides = useKeymap.getState().overrides): string[] => overrides[id] ?? byId.get(id)?.keys ?? []
export const isCustom = (id: string, overrides = useKeymap.getState().overrides) => id in overrides

let cache: { o: Record<string, string[]>; map: Map<string, Command> } | null = null
function keymap() {
  const o = useKeymap.getState().overrides
  if (cache?.o === o) return cache.map
  const map = new Map<string, Command>()
  for (const c of COMMANDS) for (const k of keysOf(c.id, o)) { const id = keyId(k); if (id && !map.has(id)) map.set(id, c) }
  cache = { o, map }; return map
}
/** The command bound to this key press, if any. */
export const commandForEvent = (e: KeyboardEvent) => keymap().get(comboId(eventCombo(e)))
/** Commands (other than exceptId) already using this key string. */
export const collisions = (key: string, exceptId?: string): Command[] => {
  const id = keyId(key); if (!id) return []
  return COMMANDS.filter((c) => c.id !== exceptId && keysOf(c.id).some((k) => keyId(k) === id))
}

const recents: string[] = []
export const recentCommands = () => recents.slice(0, EDITOR.recentCommands)
export function runCommandById(id: string, s: S) {
  const c = byId.get(id); if (!c) return
  const i = recents.indexOf(id); if (i >= 0) recents.splice(i, 1); recents.unshift(id)
  c.run(s)
}

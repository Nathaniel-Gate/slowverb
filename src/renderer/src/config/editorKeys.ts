import { TL } from './timeline'

// Editor shortcuts and tunables. Keys are mac style: 'Cmd+Shift+K', 'Alt+Left', 'Space'. Modifiers are matched EXACTLY
// (Shift+X is not X). Key names: A-Z, 0-9, Left/Right/Up/Down, Space, Delete, Backspace, Home, End, Escape, Enter, Tab,
// and the literals ; ' \ = - , . / [ ]. Command ids match editor/commands.ts. No default may collide (commands.test.ts checks).
// Users can override any of these in the Shortcuts dialog (Cmd+Alt+K); overrides persist in localStorage.
export const DEFAULT_KEYS: Record<string, string[]> = {
  // tools
  'tool.select': ['V'], 'tool.razor': ['C'], 'tool.ripple': ['B'], 'tool.slip': ['Y'], 'tool.hand': ['H'], 'tool.zoom': ['Z'],
  'tool.roll': ['N'], 'tool.rate': ['R'],
  // transport
  'play': ['Space'], 'playRange': ['Shift+Space'], 'loop': ['Cmd+L'],
  'shuttle.back': ['J'], 'shuttle.stop': ['K'], 'shuttle.fwd': ['L'],
  'step.back': ['Left'], 'step.fwd': ['Right'], 'step.backBig': ['Shift+Left'], 'step.fwdBig': ['Shift+Right'],
  'edit.prev': ['Up'], 'edit.next': ['Down'], 'home': ['Home'], 'end': ['End'],
  // cutting
  'split': ['Cmd+K'], 'splitAll': ['Cmd+Shift+K'],
  'trim.headRipple': ['Q'], 'trim.tailRipple': ['W'], 'trim.head': ['Alt+Q'], 'trim.tail': ['Alt+W'],
  'delete': ['Delete', 'Backspace'], 'rippleDelete': ['Shift+Delete', 'Shift+Backspace'],
  'lift': [';'], 'extract': ["'"], 'closeGaps': [],
  'crossfade': ['Cmd+D'], 'uncrossfade': [], 'repeat': ['Cmd+Shift+D'], 'disable': ['Shift+E'],
  'nudge.back': ['Alt+Left'], 'nudge.fwd': ['Alt+Right'], 'nudge.backBig': ['Cmd+Alt+Left'], 'nudge.fwdBig': ['Cmd+Alt+Right'],
  // selection and clipboard
  'selectAll': ['Cmd+A'], 'deselect': ['Cmd+Shift+A', 'Escape'], 'selectFwd': ['A'], 'selectBack': ['Shift+A'],
  'copy': ['Cmd+C'], 'cut': ['Cmd+X'], 'paste': ['Cmd+V'], 'pasteInsert': ['Cmd+Shift+V'],
  // marks and markers
  'markIn': ['I'], 'markOut': ['O'], 'gotoIn': ['Shift+I'], 'gotoOut': ['Shift+O'], 'clearIn': ['Alt+I'], 'clearOut': ['Alt+O'], 'clearMarks': ['Alt+X'],
  'marker': ['M'], 'marker.next': ['Shift+M'], 'marker.prev': ['Shift+Alt+M'],
  // view
  'snap': ['S'], 'beatSnap': ['Shift+S'], 'showBeats': ['Shift+B'], 'fit': ['\\'], 'fitSelection': ['Shift+\\'],
  'zoomIn': ['=', 'Shift+=', 'NumpadAdd'], 'zoomOut': ['-', 'NumpadSubtract'],
  'dock.inspector': ['Alt+1'], 'dock.source': ['Alt+2'], 'dock.markers': ['Alt+3'], 'dock.mix': ['Alt+4'], 'dock.bpm': ['Alt+5'], 'dock.hide': ['Alt+0'],
  // project
  'undo': ['Cmd+Z'], 'redo': ['Cmd+Shift+Z', 'Cmd+Y'], 'history': ['Cmd+Alt+Z'], 'save': ['Cmd+S'], 'render': ['Cmd+E'],
  'version.new': [], 'version.duplicate': [], 'syncLock': [],
  // overlays
  'palette': ['Cmd+Shift+P'], 'shortcuts': ['Cmd+Alt+K']
}

// Tunables for the editor shell and store.
export const EDITOR = {
  autosaveMs: 700,            // debounce before a dirty project is written to its sidecar
  zoomMin: TL.minPps, zoomMax: TL.maxPps,  // pixels per second (limits shared with the timeline)
  zoomStep: 1.25,             // factor per +/- key
  defaultPxPerSec: 80,
  fitPadPx: 48,               // breathing room when fitting the whole project to the view
  nudgeSec: 0.1, nudgeBigSec: 1,           // playhead step (arrows, Shift+arrows)
  nudgeClipSec: 0.01, nudgeClipBigMul: 10, // clip nudge (Alt+arrows, Cmd+Alt+arrows = x10)
  crossfadeSec: 0.5,          // default crossfade length (Cmd+D)
  coalesceMs: 700,            // edits of the same kind inside this window (slider drags, held nudges) share ONE undo step
  edgeEps: 1e-4,              // seconds: tolerance when stepping between edit points
  headerW: 188,               // track header column width, px
  toastMs: 2200,              // how long a toast stays up
  unmountMs: 320,             // keep the editor mounted this long after close so the exit animation can play
  shuttleSteps: [1, 2, 4, 8], // J/K/L: each extra tap goes one step faster
  shuttleSlow: 0.25,          // K held + J/L
  recentCommands: 6,          // palette shows this many recently used commands first
  keysStorage: 'slowverb.editor.keys', renderStorage: 'slowverb.editor.render',
  render: { bitDepth: 16 as 16 | 24 | 32, normalize: false }
} as const

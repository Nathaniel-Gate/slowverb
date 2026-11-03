import { TL } from './timeline'

// Editor shortcuts and tunables. Keys are mac style: 'Cmd+Shift+K', 'Alt+Left', 'Space'. Modifiers are matched EXACTLY
// (Shift+X is not X). Key names: A-Z, 0-9, Left/Right/Up/Down, Space, Delete, Backspace, Home, End, Escape, Enter, Tab,
// and the literals ; ' \ = - , . / [ ]. Command ids match editor/commands.ts. No default may collide (commands.test.ts checks).
// Users can override any of these in the Shortcuts dialog (Cmd+Alt+K); overrides persist in localStorage.
export const DEFAULT_KEYS: Record<string, string[]> = {
  // tools
  'tool.select': ['V'], 'tool.razor': ['Shift+C'], 'tool.ripple': ['B'], 'tool.slip': ['Y'], 'tool.hand': ['H'], 'tool.zoom': ['Alt+Z'],
  'tool.roll': ['N'], 'tool.rate': ['Shift+R'], 'tool.range': ['R'],
  // transport
  'play': ['Space'], 'playRange': ['Shift+Space'], 'loop': ['Cmd+L'],
  'shuttle.back': ['J'], 'shuttle.stop': ['K'], 'shuttle.fwd': ['L'],
  'step.back': ['Left'], 'step.fwd': ['Right'], 'step.backBig': ['Shift+Left'], 'step.fwdBig': ['Shift+Right'],
  'edit.prev': ['Up'], 'edit.next': ['Down'], 'home': ['Home'], 'end': ['End'],
  // cutting
  'split': ['F', 'Cmd+K', 'Cmd+\\'], 'splitAll': ['Cmd+Shift+K'],
  'trim.headRipple': ['Q'], 'trim.tailRipple': ['W'], 'trim.head': ['Alt+Q'], 'trim.tail': ['Alt+W'],
  'delete': ['D', 'Delete', 'Backspace'], 'rippleDelete': ['Shift+Delete', 'Shift+Backspace'],
  'lift': [';'], 'extract': ["'"], 'closeGaps': [],
  // wave 3 (Resolve style). M stays Add marker, so Mute range is Alt+M.
  'extend': ['E'], 'trimSel.start': ['Shift+['], 'trimSel.end': ['Shift+]'],
  'range.mute': ['Alt+M'], 'range.gainUp': ['Alt+Up'], 'range.gainDown': ['Alt+Down'], 'range.fadeIn': ['Alt+F'], 'range.fadeOut': ['Alt+Shift+F'],
  'crossfade': ['Cmd+D'], 'uncrossfade': [], 'repeat': ['Cmd+Shift+D'], 'disable': ['Shift+E'],
  'nudge.back': ['Alt+Left'], 'nudge.fwd': ['Alt+Right'], 'nudge.backBig': ['Cmd+Alt+Left'], 'nudge.fwdBig': ['Cmd+Alt+Right'],
  // wave 4: loop clips. Alt+[ ] move the begin point, Alt+Shift+[ ] the end point (1 ms); add Cmd for 10 ms.
  'loop.make': ['Alt+L'], 'loop.unloop': ['Alt+Shift+L'], 'loop.detach': ['Alt+Shift+D'], 'loop.in-': ['Alt+['], 'loop.in+': ['Alt+]'], 'loop.out-': ['Alt+Shift+['], 'loop.out+': ['Alt+Shift+]'],
  'loop.in-fine': ['Cmd+Alt+['], 'loop.in+fine': ['Cmd+Alt+]'], 'loop.out-fine': ['Cmd+Alt+Shift+['], 'loop.out+fine': ['Cmd+Alt+Shift+]'],
  'loop.fill': [], 'loop.count+': ['Alt+='], 'loop.count-': ['Alt+-'],
  // selection and clipboard
  'bounce': ['Cmd+Alt+B'], 'selectAll': ['Cmd+A'], 'selectAtPlayhead': ['C'], 'deselect': ['Cmd+Shift+A', 'Escape'], 'selectFwd': ['A'], 'selectBack': ['Shift+A'],
  'copy': ['Cmd+C'], 'cut': ['Cmd+X'], 'paste': ['Cmd+V'], 'pasteInsert': ['Cmd+Shift+V'],
  // marks and markers
  'markIn': ['I'], 'markOut': ['O'], 'gotoIn': ['Shift+I'], 'gotoOut': ['Shift+O'], 'clearIn': ['Alt+I'], 'clearOut': ['Alt+O'], 'clearMarks': ['Alt+X'],
  'marker': ['M'], 'marker.next': ['Shift+M'], 'marker.prev': ['Shift+Alt+M'],
  // view
  'snap': ['S'], 'beatSnap': ['Shift+S'], 'showBeats': ['Shift+B'], 'fit': ['\\', 'Shift+Z'], 'fitSelection': ['Shift+\\'],
  'zoomIn': ['X', '=', 'Shift+=', 'NumpadAdd'], 'zoomOut': ['Z', '-', 'NumpadSubtract'],
  'dock.inspector': ['Alt+1'], 'dock.source': ['Alt+2'], 'dock.markers': ['Alt+3'], 'dock.mix': ['Alt+4'], 'dock.bpm': ['Alt+5'], 'dock.auto': ['Alt+6'], 'dock.hide': ['Alt+0'],
  // project
  'undo': ['Cmd+Z'], 'redo': ['Cmd+Shift+Z', 'Cmd+Y'], 'history': ['Cmd+Alt+Z'], 'save': ['Cmd+S'], 'render': ['Cmd+E'],
  'version.new': [], 'version.duplicate': [], 'syncLock': [],
  // overlays
  'palette': ['Cmd+Shift+P'], 'shortcuts': ['Cmd+Alt+K']
}

// Tunables for the editor shell and store.
export const EDITOR = {
  autosaveMs: 300,            // debounce before a dirty project is written to its sidecar
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
  gainStepDb: 1,              // Alt+Up / Alt+Down gain step on a range or the selected clips
  gainMaxDb: 12,              // selected-clip gain via keys never goes above this
  silenceDb: -50,             // 'Trim silence' treats anything quieter than this (dBFS) as silence
  sectionDupSec: 0.25,        // a detected section boundary this close to an existing marker is skipped
  loop: {
    nudgeSec: 0.001, nudgeBigSec: 0.01,   // loop point keys: 1 ms; the Cmd variants 10 ms
    defaultCount: 4,                      // MAKE LOOP repeats (the crossfade default lives in the ops)
    maxCount: 200,                        // matches LOOP_MAX in opsLoop.ts
    stepMs: 1, stepBigMs: 10,             // Inspector steppers: click = 1 ms, Shift-click = 10 ms
    holdDelayMs: 380, holdEveryMs: 60,    // hold a stepper: first repeat after the delay, then this often
    wavePadFrac: 0.25, wavePadMinSec: 0.02,  // FIT shows the loop plus this fraction of its length either side
    refitBelowFrac: 0.04,                 // the wave refits itself when the loop is under this fraction of the window
    pointWinSec: 0.2,                     // IN / OUT zoom chips: window centred on the point
    zoomMinWinSec: 0.002,                 // closest the mini wave zooms (about 90 samples at 44.1 kHz)
    zoomStep: 2, wheelZoom: 1.0018,       // zoom buttons factor; wheel zoom factor per delta unit
    fineDrag: 0.1                         // Alt while dragging a handle = this fraction of the pointer movement
  },
  keysStorage: 'slowverb.editor.keys', renderStorage: 'slowverb.editor.render',
  render: { bitDepth: 16 as 16 | 24 | 32, normalize: false }
} as const

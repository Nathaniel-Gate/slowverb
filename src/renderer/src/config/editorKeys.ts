import type { Tool } from '../editor/model'
import { TL } from './timeline'

// Editor shortcuts. code = KeyboardEvent.code. meta = needs Cmd. shift/alt: omitted = ignored for shift, must be off for alt.
// repeat: true lets holding the key repeat the action. Actions are implemented in editor/useEditorKeys.ts.
export type EditorAction =
  | `tool:${Tool}` | 'play' | 'split' | 'delete' | 'rippleDelete' | 'undo' | 'redo' | 'snap' | 'fit' | 'zoomIn' | 'zoomOut'
  | 'nudgeBack' | 'nudgeFwd' | 'nudgeBackBig' | 'nudgeFwdBig' | 'prevEdit' | 'nextEdit' | 'home' | 'end'
  | 'markIn' | 'markOut' | 'clearIn' | 'clearOut' | 'marker' | 'selectAll' | 'deselect' | 'copy' | 'cut' | 'paste'
export type EditorKey = { code: string; meta?: boolean; shift?: boolean; alt?: boolean; repeat?: boolean; action: EditorAction }

// Order matters: the first match wins, so put the shift variants first.
export const EDITOR_KEYS: EditorKey[] = [
  { code: 'KeyV', action: 'tool:select' }, { code: 'KeyC', action: 'tool:razor' }, { code: 'KeyB', action: 'tool:ripple' },
  { code: 'KeyY', action: 'tool:slip' }, { code: 'KeyH', action: 'tool:hand' }, { code: 'KeyZ', action: 'tool:zoom' },
  { code: 'Space', action: 'play' },
  { code: 'KeyK', meta: true, action: 'split' },
  { code: 'Delete', shift: true, action: 'rippleDelete' }, { code: 'Backspace', shift: true, action: 'rippleDelete' },
  { code: 'Delete', action: 'delete' }, { code: 'Backspace', action: 'delete' },
  { code: 'KeyZ', meta: true, shift: true, repeat: true, action: 'redo' }, { code: 'KeyZ', meta: true, repeat: true, action: 'undo' },
  { code: 'KeyS', action: 'snap' }, { code: 'Backslash', action: 'fit' },
  { code: 'Equal', repeat: true, action: 'zoomIn' }, { code: 'NumpadAdd', repeat: true, action: 'zoomIn' },
  { code: 'Minus', repeat: true, action: 'zoomOut' }, { code: 'NumpadSubtract', repeat: true, action: 'zoomOut' },
  { code: 'ArrowLeft', shift: true, repeat: true, action: 'nudgeBackBig' }, { code: 'ArrowRight', shift: true, repeat: true, action: 'nudgeFwdBig' },
  { code: 'ArrowLeft', repeat: true, action: 'nudgeBack' }, { code: 'ArrowRight', repeat: true, action: 'nudgeFwd' },
  { code: 'ArrowUp', action: 'prevEdit' }, { code: 'ArrowDown', action: 'nextEdit' },
  { code: 'Home', action: 'home' }, { code: 'End', action: 'end' },
  { code: 'KeyI', alt: true, action: 'clearIn' }, { code: 'KeyO', alt: true, action: 'clearOut' },
  { code: 'KeyI', action: 'markIn' }, { code: 'KeyO', action: 'markOut' }, { code: 'KeyM', action: 'marker' },
  { code: 'KeyA', meta: true, action: 'selectAll' }, { code: 'Escape', action: 'deselect' },
  { code: 'KeyC', meta: true, action: 'copy' }, { code: 'KeyX', meta: true, action: 'cut' }, { code: 'KeyV', meta: true, action: 'paste' }
]

// Tunables for the editor shell and store.
export const EDITOR = {
  autosaveMs: 700,            // debounce before a dirty project is written to its sidecar
  zoomMin: TL.minPps, zoomMax: TL.maxPps,  // pixels per second (limits shared with the timeline)
  zoomStep: 1.25,             // factor per +/- key
  defaultPxPerSec: 80,
  fitPadPx: 48,               // breathing room when fitting the whole project to the view
  nudgeSec: 0.1, nudgeBigSec: 1,
  edgeEps: 1e-4,              // seconds: tolerance when stepping between edit points
  headerW: 188,               // track header column width, px
  noteMs: 2400,               // how long a finished status ("Saved to library") stays in the header
  unmountMs: 320              // keep the editor mounted this long after close so the exit animation can play
} as const

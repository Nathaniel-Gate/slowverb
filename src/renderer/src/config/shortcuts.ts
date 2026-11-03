// key = KeyboardEvent.code; meta = needs Cmd. Actions are implemented in features/player/useShortcuts.ts.
export const SHORTCUTS: { code: string; meta?: boolean; action: 'toggle' | 'next' | 'prev' | 'bypass' | 'back5' | 'fwd5' }[] = [
  { code: 'Space', action: 'toggle' },
  { code: 'ArrowRight', meta: true, action: 'next' },
  { code: 'ArrowLeft', meta: true, action: 'prev' },
  { code: 'ArrowRight', action: 'fwd5' },
  { code: 'ArrowLeft', action: 'back5' },
  { code: 'KeyB', action: 'bypass' } // hold-free A/B: toggles original vs your version
]

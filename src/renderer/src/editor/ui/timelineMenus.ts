import type { Clip, Project } from '../model'
import type { MenuItem } from '../commands'
import { useEditor } from '../editor.store'
import * as ops from '../ops'
import { openContextMenu } from './ContextMenu'

// Right-click menus for the timeline and track headers. Every entry calls a store action (or an op through apply),
// so a menu click does exactly what the matching key does. `keys` are display hints only (Premiere defaults).
const SEP: MenuItem = { label: '', sep: true }
const st = () => useEditor.getState()
const openMenu = openContextMenu

// Loop entries: on a repeat, the loop's own actions; on a plain clip, Loop clip.
function loopItems(clip: Clip, locked: boolean): MenuItem[] {
  const s = st()
  if (!clip.loop) return [{ label: 'Loop clip', keys: 'Alt+L', run: () => s.makeLoopFromSelection(), disabled: locked }, SEP]
  return [
    { label: 'Loop settings', run: () => s.setDock('inspector') },
    { label: 'Loop to playhead', run: () => s.loopFillToPlayhead(), disabled: locked },
    { label: 'Unloop', keys: 'Alt+Shift+L', run: () => s.unloopSelection(), disabled: locked }, SEP
  ]
}

export function clipMenu(x: number, y: number, clip: Clip, p: Project) {
  const s = st(), tr = p.tracks.find(t => t.id === clip.track)
  openMenu(x, y, [
    ...loopItems(clip, !!tr?.lock),
    { label: 'Cut', keys: 'Cmd+X', run: s.cut }, { label: 'Copy', keys: 'Cmd+C', run: s.copy }, { label: 'Paste at playhead', keys: 'Cmd+V', run: s.paste }, SEP,
    { label: 'Split at playhead', keys: 'Cmd+K', run: s.splitAtPlayhead },
    { label: 'Crossfade at cut', keys: 'Cmd+D', run: () => s.crossfadeSelection() },
    { label: 'Repeat x2', run: () => s.repeatSelection(2) },
    { label: 'Bounce in place (merge, effects baked in)', keys: 'Cmd+Alt+B', run: () => void s.bounceSelection() }, SEP,
    { label: clip.disabled ? 'Enable clip' : 'Disable clip', run: () => s.patchSelected({ disabled: !clip.disabled }) },
    { label: 'Reset gain', run: () => s.patchSelected({ gain: 1 }), disabled: clip.gain === 1 },
    { label: 'Remove fades', run: () => s.patchSelected({ fadeIn: 0, fadeOut: 0 }), disabled: !clip.fadeIn && !clip.fadeOut },
    { label: 'Reset speed', run: () => s.patchSelected({ speed: 1 }), disabled: !clip.speed || clip.speed === 1 }, SEP,
    { label: 'Delete', keys: 'Del', run: () => s.deleteSelection(false), disabled: !!tr?.lock },
    { label: 'Ripple delete', keys: 'Shift+Del', run: () => s.deleteSelection(true), disabled: !!tr?.lock, danger: true }
  ])
}

export function gapMenu(x: number, y: number, gap: { track: string; start: number; end: number }) {
  const s = st()
  openMenu(x, y, [
    { label: 'Close gap', keys: 'Shift+Del', run: () => { s.selectGap(gap); s.closeGapAtSelection() } },
    { label: 'Paste into gap', run: () => { s.setPlayhead(gap.start); s.paste() } },
    { label: 'Mark gap In/Out', run: () => { s.setMark('in', gap.start); s.setMark('out', gap.end) } }
  ])
}

export function rulerMenu(x: number, y: number, t: number, markerId?: string) {
  const s = st()
  openMenu(x, y, [
    ...(markerId ? [{ label: 'Remove marker', danger: true, run: () => s.removeMarker(markerId) }, SEP] : []),
    { label: 'Add marker here', keys: 'M', run: () => s.markerAt(t) },
    { label: 'Set In here', keys: 'I', run: () => s.setMark('in', t) }, { label: 'Set Out here', keys: 'O', run: () => s.setMark('out', t) },
    { label: 'Clear In and Out', keys: 'Alt+X', run: () => { s.setMark('in', null); s.setMark('out', null) } },
    { label: s.loop ? 'Loop off' : 'Loop on', keys: 'Cmd+L', run: s.toggleLoop }, SEP,
    { label: 'Go here', run: () => s.setPlayhead(t) }
  ])
}

export function laneMenu(x: number, y: number, t: number) {
  const s = st()
  openMenu(x, y, [
    { label: 'Paste here', keys: 'Cmd+V', run: () => { s.setPlayhead(t); s.paste() } },
    { label: 'Add marker here', keys: 'M', run: () => s.markerAt(t) },
    { label: 'Select all', keys: 'Cmd+A', run: s.selectAll }, SEP,
    { label: 'Fit project to view', keys: '\\', run: () => s.fitToView(s.viewWidth || 1000) },
    { label: 'Add track', run: () => s.apply(p => ops.addTrack(p)) }
  ])
}

export function trackMenu(x: number, y: number, id: string) {
  const s = st(), p = s.project
  const t = p?.tracks.find(k => k.id === id)
  if (!p || !t) return
  const set = (patch: Parameters<typeof ops.setTrack>[2]) => s.apply(q => ops.setTrack(q, id, patch))
  openMenu(x, y, [
    { label: t.collapsed ? 'Expand track' : 'Collapse track', run: () => set({ collapsed: !t.collapsed }) },
    { label: 'Reset height', run: () => set({ height: undefined, collapsed: false }), disabled: !t.height && !t.collapsed },
    { label: t.target ? 'Untarget track' : 'Target track', run: () => s.targetTrack(id) },
    { label: t.lock ? 'Unlock track' : 'Lock track', run: () => set({ lock: !t.lock }) },
    { label: t.mute ? 'Unmute track' : 'Mute track', run: () => set({ mute: !t.mute }) },
    { label: t.solo ? 'Unsolo track' : 'Solo track', run: () => set({ solo: !t.solo }) }, SEP,
    { label: 'Close all gaps', run: () => s.apply(q => ops.closeAllGaps(q, id)) },
    { label: 'Add track', run: () => s.apply(q => ops.addTrack(q)) },
    { label: 'Delete track', danger: true, disabled: p.tracks.length < 2 || t.lock, run: () => s.apply(q => ops.removeTrack(q, id)) }
  ])
}

import type { Fx } from '../../../shared/types'
import type { Clip, FadeCurve, Loop, Project, Tool, TrackFx } from './model'
import type { History } from './history'
import type { Buffers } from './schedule'
import type { Peaks } from './peaks'

export type DockTab = 'inspector' | 'source' | 'markers' | 'mix' | 'bpm' | 'auto'
export type Gap = { track: string; start: number; end: number }
export type ClipPatch = Partial<Pick<Clip, 'gain' | 'fadeIn' | 'fadeOut' | 'name' | 'label' | 'disabled' | 'speed'>>
export type RenderOpts = { bitDepth: 16 | 24 | 32; normalize: boolean; range: boolean }
/** A timeline range selection (Range tool). tracks null = the targeted tracks, or all when none are targeted. */
export type RangeSel = { a: number; b: number; tracks: string[] | null }
type SaveState = 'saved' | 'saving' | 'dirty'

export type S = {
  open: boolean; project: Project | null; hist: History | null; buffers: Buffers; peaks: Map<string, Peaks>
  selection: string[]; tool: Tool; playhead: number; playing: boolean; pxPerSec: number; scrollX: number; scrollY: number; viewWidth: number
  snap: boolean; markIn: number | null; markOut: number | null; saveState: SaveState; busy: string | null; clipboard: Clip[]
  // wave 2
  loop: boolean; gap: Gap | null; dockOpen: boolean; dockTab: DockTab; toast: { text: string; id: number } | null; shuttle: number
  beatSnap: boolean; showBeats: boolean; versions: string[]; renderOpts: RenderOpts
  // wave 3
  range: RangeSel | null

  openSong(path: string, opts?: { show?: boolean }): Promise<Project | null>; prepare(path: string): Promise<Project | null>; show(): void; close(): void; flush(): Promise<void>
  apply(fn: (p: Project) => Project): void; undo(): void; redo(): void; jumpHistory(offset: number): void
  select(ids: string[], additive?: boolean): void; setTool(t: Tool): void
  setZoom(pxPerSec: number, anchorSec?: number): void; setScroll(x: number): void; setScrollY(y: number): void; setViewWidth(w: number): void; fitToView(viewWidth: number): void
  setPlayhead(t: number): void; now(): number; toggleSnap(): void; togglePlay(): Promise<void>
  splitAtPlayhead(): void; splitAllAtPlayhead(): void; deleteSelection(ripple: boolean): void; resetToOriginal(): void; selectAll(): void; selectAtPlayhead(): void
  copy(): void; cut(): void; paste(): void; pasteInsert(): void; setMark(which: 'in' | 'out', t: number | null): void; addMarkerAtPlayhead(): void
  setTrackFx(id: string, patch: { low?: number; mid?: number; high?: number; reverb?: Partial<NonNullable<TrackFx['reverb']>> | null }): void; resetTrackFx(id: string): void; renderToLibrary(): Promise<void>; bounceSelection(): Promise<void>; setRenderOpts(o: Partial<RenderOpts>): void; renameVersion(name: string): Promise<void>; renameSong(name: string): Promise<void>

  insertSource(path: string, t: number, track: string | undefined, mode: 'insert' | 'overwrite', range?: { in: number; out: number }): Promise<void>
  patchSelected(patch: ClipPatch): void; applyMaster(fx: Fx | null): void; setBpm(bpm: number | null, offset?: number): void
  toggleLoop(): void; playRange(): void; liftRange(): void; extractRange(): void; closeGapAtSelection(): void; closeAllGaps(): void
  trimToPlayhead(which: 'prevTail' | 'nextHead', ripple: boolean): void; rollEdit(leftId: string, rightId: string, t: number): void
  rateStretch(id: string, newEnd: number): void; repeatSelection(times: number): void; crossfadeSelection(dur?: number): void; uncrossfadeSelection(): void
  nudge(dt: number): void; selectForward(): void; selectBackward(): void; selectGap(g: Gap | null): void
  targetTrack(id: string, exclusive?: boolean): void; toggleSyncLock(): void; toggleAutoDelete(): void; toggleDisable(): void
  scrubTo(t: number): void; shuttleKey(dir: -1 | 0 | 1): void; shuttleHold(held: boolean): void
  showToast(text: string): void; setDock(tab: DockTab | null): void; toggleBeatSnap(): void; toggleShowBeats(): void
  markerAt(t: number, name?: string): void; renameMarker(id: string, name: string): void; removeMarker(id: string): void
  newVersion(name?: string): Promise<void>; duplicateVersion(): Promise<void>; openVersion(name: string): Promise<void>; deleteVersion(name: string): Promise<void>
  listVersions(): string[]; refreshVersions(): Promise<void>; runCommand(id: string): void; fitSelection(): void; gotoTime(t: number): void

  // wave 3: range, envelope, fades, smart edits. Range actions use `range`, falling back to the In/Out marks.
  setRange(r: RangeSel | null): void; muteRange(): void; gainRangeDb(db: number): void; fadeRangeEdge(kind: 'in' | 'out'): void
  liftRangeSel(): void; extractRangeSel(): void; gainSelectedDb(db: number): void
  setEnvPointAt(clipId: string, tClip: number, g: number, index?: number): void; removeEnvPointAt(clipId: string, index: number): void; clearEnvSelected(): void
  setFadeCurveSel(which: 'in' | 'out', curve: FadeCurve): void
  extendEditToPlayhead(): void; trimStartToPlayhead(): void; trimEndToPlayhead(): void; splitAtMarkers(): void; setSmoothCuts(on: boolean): void
  detectSectionsToMarkers(): Promise<void>; cutEveryBeatsAction(beats: number): void; trimSilenceSelected(): void

  // wave 4: loop clips (one Loop record, expanded into crossfaded repeat clips on one track)
  makeLoopFromSelection(count?: number, xfade?: number): void
  /** Continuous gestures (drag, stepper hold, key burst) pass a coalesceKey so the whole gesture is ONE undo step. */
  updateLoopLive(loopId: string, patch: LoopPatch, coalesceKey?: string): void
  nudgeLoop(which: 'in' | 'out' | 'both', dt: number): void
  loopFillToPlayhead(): void; unloopSelection(): void; selectedLoop(): Loop | undefined
}
export type LoopPatch = Partial<Pick<Loop, 'srcIn' | 'srcOut' | 'count' | 'xfade' | 'start' | 'gain'>>

export type EditKeys = 'patchSelected' | 'toggleDisable' | 'liftRange' | 'extractRange' | 'closeGapAtSelection' | 'closeAllGaps' | 'trimToPlayhead' | 'rollEdit' | 'rateStretch'
  | 'repeatSelection' | 'crossfadeSelection' | 'uncrossfadeSelection' | 'nudge' | 'selectForward' | 'selectBackward' | 'selectGap' | 'targetTrack' | 'toggleSyncLock' | 'toggleAutoDelete' | 'markerAt' | 'renameMarker' | 'removeMarker'
export type ProjectKeys = 'insertSource' | 'setTrackFx' | 'resetTrackFx' | 'applyMaster' | 'setBpm' | 'toggleBeatSnap' | 'toggleShowBeats' | 'setDock' | 'fitSelection' | 'gotoTime' | 'listVersions' | 'refreshVersions'
  | 'newVersion' | 'duplicateVersion' | 'openVersion' | 'deleteVersion'
export type RangeKeys = 'setRange' | 'muteRange' | 'gainRangeDb' | 'fadeRangeEdge' | 'liftRangeSel' | 'extractRangeSel' | 'gainSelectedDb' | 'setEnvPointAt' | 'removeEnvPointAt'
  | 'clearEnvSelected' | 'setFadeCurveSel' | 'extendEditToPlayhead' | 'trimStartToPlayhead' | 'trimEndToPlayhead' | 'splitAtMarkers' | 'setSmoothCuts'
export type AutoKeys = 'detectSectionsToMarkers' | 'cutEveryBeatsAction' | 'trimSilenceSelected'
export type LoopKeys = 'makeLoopFromSelection' | 'updateLoopLive' | 'nudgeLoop' | 'loopFillToPlayhead' | 'unloopSelection' | 'selectedLoop'
export type PlayKeys = 'toggleLoop' | 'playRange' | 'scrubTo' | 'shuttleHold' | 'shuttleKey'

type SetFn = (p: Partial<S> | ((s: S) => Partial<S>)) => void
/** What the store's action modules share. Built once in editor.store.ts. */
export type Ctx = {
  set: SetFn; get: () => S
  toast(text: string): void
  /** apply(fn); toast ok on a change, or `none` when the op changed nothing. Returns whether anything changed. */
  edit(fn: (p: Project) => Project, ok: string | ((s: S) => string), none?: string): boolean
  /** Like apply but edits sharing `key` inside EDITOR.coalesceMs collapse into one undo step (slider drags, held nudges). */
  coalesce(key: string, fn: (p: Project) => Project): void
  stopPlayback(): void; schedule(): void; resync(): void
  /** Replace the open project (version switch): stops playback, loads missing buffers, resets selection. */
  switchTo(p: Project): Promise<void>
  /** Tracks flagged as targets, or undefined (= all tracks) when none are. */
  targets(): string[] | undefined
}

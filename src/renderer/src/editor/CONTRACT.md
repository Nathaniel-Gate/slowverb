# Editor contract (wave 1). Every agent implements EXACTLY these signatures so the pieces plug together.
Project: ~/Projects/slowverb (Electron + React + zustand + Web Audio). Read ~/Projects/slowverb/CLAUDE.md first.
Model types are in `editor/model.ts` (do not change them; ask the lead if something is missing).
Rules: greyscale blueprint look (tokens in `theme/tokens.css`, motion in `theme/motion.css`), IBM Plex, mono uppercase labels, radius tokens.
No em dashes anywhere. Never `rm`; move to ~/.Trash. Do NOT run git commit/add (the lead commits). Do NOT touch files you do not own.
Keep files under ~200 lines, tunables in `config/`, no magic numbers inline. Other agents' files may not exist or not compile yet: ignore their tsc errors, make sure YOUR files typecheck (`npx tsc --noEmit`, filter to your paths) and your tests pass (`npm test`).

## ops (agent A: editor/ops.ts, editor/history.ts, editor/snap.ts, *.test.ts)  all pure, return a NEW Project
- newProject(song: string, duration: number, name?: string): Project   // one track "A1", one clip = whole song at t=0, sources[song]={duration}
- splitAt(p, t: number, ids?: string[]): Project        // split clips under t (those in ids if given, else all clips on unlocked tracks); no-op if t is at a clip edge
- deleteClips(p, ids: string[]): Project                // leaves gaps
- rippleDelete(p, ids: string[]): Project               // delete, then shift later clips on the SAME tracks left by the removed span (merge overlapping spans per track)
- moveClips(p, ids: string[], dt: number, trackShift = 0): Project   // trackShift = index offset in p.tracks; later start clamped >= 0; landing on other clips on a track OVERWRITES (trims/removes/splits what is underneath), locked tracks refuse
- trimClip(p, id: string, edge: 'in' | 'out', t: number): Project   // t = new TIMELINE time of that edge; clamps to source bounds, MIN_CLIP, overwrites neighbours it grows into
- rippleTrim(p, id: string, edge: 'in' | 'out', t: number): Project // like trimClip but later clips on the track shift by the length change
- duplicateClips(p, ids: string[], dt: number): Project              // copies new ids, offset dt, overwrite rule
- pasteClips(p, clips: Clip[], at: number, track?: string): Project  // earliest clip lands at `at`, keeps relative offsets, new ids
- setClip(p, id: string, patch: Partial<Pick<Clip,'gain'|'fadeIn'|'fadeOut'>>): Project   // fades clamp so fadeIn+fadeOut <= duration
- addTrack(p, name?: string): Project; removeTrack(p, id: string): Project; setTrack(p, id: string, patch: Partial<Omit<Track,'id'>>): Project
- addMarker(p, t: number, name?: string): Project; removeMarker(p, id: string): Project
- editPoints(p): number[]                                // sorted unique clip starts and ends
- snapTime(p, t: number, o: { enabled: boolean; playhead: number; pxPerSec: number; thresholdPx: number; exclude?: string[] }): number  // snaps to clip edges, playhead, markers, 0
- history: type History = { past: Project[]; present: Project; future: Project[] }; createHistory(p): History; pushHistory(h, p): History (cap 200, ignores identical p); undo(h): History; redo(h): History
Invariants after EVERY op: same-track clips never overlap; every clip has srcOut - srcIn >= MIN_CLIP; srcIn >= 0; srcOut <= sources[src].duration; ids unique. Provide a `validate(p): string[]` (list of violations) used by tests.

## audio (agent B: editor/schedule.ts, editor/render.ts, editor/peaks.ts, editor/transport.ts, config/editorAudio.ts, harness tests in src/main/devshot.ts ONLY for the SLOWVERB_ED env branch)
- type Buffers = Map<string, AudioBuffer>                                         // by source path
- loadBuffers(p: Project, ctx: BaseAudioContext, only?: string[]): Promise<Buffers>  // fetch(mediaUrl(path)) then ctx.decodeAudioData; skips already-loaded
- buildGraph(ctx: BaseAudioContext, p: Project, buffers: Buffers, fromSec: number, atCtxTime: number): { endCtxTime: number; stop(): void }
    // for each clip overlapping [fromSec, end): source node start(when, offset, duration) sample-accurate; clip gain node with fadeIn/fadeOut (config curve: equal-power default) ; track gain/mute/solo; all into ONE master input that goes through buildChain(ctx, input) from audio/chain.ts with p.master ?? DEFAULT_FX applied (chain.apply)
- renderProject(p: Project, buffers: Buffers): Promise<{ channels: Float32Array[]; rate: number }>   // OfflineAudioContext, SAME buildGraph; length = projectEnd/speed + reverb tail
- peaks: type Peaks = { rate: number; levels: { spp: number; min: Float32Array; max: Float32Array }[] }; computePeaks(buf: AudioBuffer): Peaks (levels at spp 64, 256, 1024, 4096); pickLevel(pk: Peaks, secPerPx: number): { spp: number; min: Float32Array; max: Float32Array }
- transport: class EditorTransport { constructor(); ctx: AudioContext; get playing(): boolean; position(): number (timeline seconds, smooth); async play(p: Project, buffers: Buffers, from: number): Promise<void>; pause(): number (returns position); seek(p: Project, buffers: Buffers, to: number): void (reschedules if playing, 10ms de-click); onEnded?: () => void }
- export `editorTransport` singleton. Live playback must also route through the same master chain.
Proofs required (extend the harness with env SLOWVERB_ED=1 printing JSON `ED_RESULT`): a gap renders as exact silence of the right length; two clips on two tracks sum; fadeIn starts at 0 and reaches clip gain; total length = projectEnd; an untouched single clip renders equal to the source (max abs diff < 1e-4); a real downloaded m4a (~/Music/Slowverb/Helium.m4a) decodes via decodeAudioData and renders.

## main process + IPC (agent C: src/main/editor.ts, edits to src/main/index.ts, src/preload/index.ts, src/renderer/src/global.d.ts, tests in src/main/ if feasible)
Sidecar layout: `<dirname(song)>/.edits/<songBaseName>/<versionName>.json` (dot-folder; the library folder scan already skips dot-folders: verify and write a test).
window.api additions (preload + types + ipcMain handlers):
- editorList(song: string): Promise<string[]>                        // version names, newest first
- editorLoad(song: string, name: string): Promise<Project | null>
- editorSave(song: string, project: Project): Promise<void>         // atomic write (temp + rename)
- editorDelete(song: string, name: string): Promise<void>           // to Trash
- editorRenameVersion(song: string, from: string, to: string): Promise<void>
- renameSong(song: string, newBaseName: string): Promise<string>    // renames the file (same extension, unique, no overwrite), moves its .edits/<base> folder, returns the new path
- saveRender(song: string, versionName: string, wav: ArrayBuffer): Promise<string>  // writes `<dirname>/<songBase> (<versionName>).wav`, unique name, returns path (the folder watcher then adds it to the library)
Project type is imported from the renderer model file (`../renderer/src/editor/model`) for typing only. All names sanitised (no path separators, no leading dots). Notify nothing; the watcher handles refresh.

## store + shell (agent D1: editor/editor.store.ts, editor/ui/EditorView.tsx, editor/ui/HeaderBar.tsx, editor/ui/ToolStrip.tsx, editor/ui/TrackHeaders.tsx, editor/editor.css, editor/useEditorKeys.ts, config/editorKeys.ts, plus small edits to App.tsx, features/player/NowPlaying.tsx, features/library/Playlist.tsx, theme/index.css, wire.ts)
useEditor (zustand) state: { open: boolean; project: Project | null; hist: History | null; buffers: Buffers; peaks: Map<string, Peaks>; selection: string[]; tool: Tool; playhead: number; playing: boolean; pxPerSec: number; scrollX: number; snap: boolean; markIn: number | null; markOut: number | null; saveState: 'saved' | 'saving' | 'dirty'; busy: string | null (e.g. 'Rendering') }
actions: openSong(path: string) (loads newest version or creates newProject, loads buffers+peaks, opens the tab), close(), apply(fn: (p: Project) => Project) (pushes history, marks dirty, debounced autosave via editorSave, reschedules playback if playing), undo(), redo(), select(ids: string[], additive?: boolean), setTool(t), setZoom(pxPerSec: number, anchorSec?: number), setScroll(x: number), setPlayhead(t: number) (seeks transport), toggleSnap(), togglePlay(), splitAtPlayhead(), deleteSelection(ripple: boolean), renderToLibrary(): Promise<void> (renderProject -> encodeWav -> saveRender, shows busy), renameVersion(name), renameSong(name), fitToView(viewWidth: number)
Playhead: store holds a 'playing' flag; the TIMELINE view reads transport.position() in requestAnimationFrame and moves the playhead with transform (do not put per-frame time in zustand).
Layout (EditorView): header bar (back to player, song name + version name editable, save status, Render button, Undo/Redo), tool strip on the left, track headers column + <Timeline/> (agent D2's component, import from './Timeline' i.e. editor/ui/Timeline.tsx, props: none, reads useEditor) filling the rest. In editor mode App hides the sidebar and shows EditorView; a sliding-pill mode switch PLAYER | EDITOR sits in the top drag area (reuse the highlight idea from features/playlists/PlaylistTree.tsx). Entry points: an EDIT button on NowPlaying, double-click on a song row. Keys (config/editorKeys.ts, handler useEditorKeys.ts, only active in editor mode and not while typing in an input): V C B Y H Z tools, Space play, Cmd+K split at playhead, Delete / Shift+Delete, Cmd+Z / Shift+Cmd+Z, S snap, `\` fit, +/- zoom, Left/Right nudge playhead (Shift = 1s), Up/Down jump to previous/next edit point, I/O marks, M marker, Cmd+A select all, Cmd+C/X/V copy/cut/paste (clipboard in store).
Import ops from './ops', history from './history', audio from './schedule' './peaks' './transport' './render' (written in parallel by other agents: code against the contract).

## timeline view (agent D2: editor/ui/Timeline.tsx, editor/ui/Ruler.tsx, editor/ui/ClipView.tsx, editor/ui/useTimelineInput.ts, editor/ui/timeline.css, config/timeline.ts)
Component `Timeline` (no props) renders: ruler with ticks and m:ss.mmm labels (adaptive spacing), one lane per Project.track (lane height from config, tracks stacked in the SAME order as TrackHeaders, which D1 builds), clips drawn on canvas or DOM+canvas (waveform from pickLevel(peaks.get(src), 1/pxPerSec), only the visible range, offset by clip.srcIn), clip label, fade triangles, selection outline, playhead line (transform from editorTransport.position() via rAF; draggable by clicking the ruler), markers on the ruler, markIn/Out shading, snap indicator line, horizontal scroll (scrollX in store, wheel + trackpad; Cmd+wheel / pinch zooms around the cursor), vertical scroll in sync with track headers.
Interactions via useEditor actions + ops (apply(p => ops.moveClips(...))): select tool = click select, shift-click add, marquee, drag to move (with snapTime and trackShift), drag edges to trim, alt-drag duplicates; razor tool = click splits at that time (snapped) on that clip, shift = all tracks; ripple tool = trims ripple; hand = pan; zoom = click in/out; slip = drag changes srcIn/srcOut keeping position (implement via two trimClip-like ops or a small helper in your own file). During drags keep local preview state and call apply once on mouse up. Cursor changes per tool. All motion tokens from theme/motion.css, reduced-motion respected. Colours from tokens only (clips greyscale with a lighter selected state); put clip/lane colours in timeline.css variables so they are easy to retheme.

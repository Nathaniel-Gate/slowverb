# Slowverb map (read first)
Mac music player: drop audio/folders in, playlist persists, speed + reverb "versions". Electron + React + Web Audio.
Run: `npm run dev` · test: `npm test` · install to ~/Applications: `npm run deploy`.

| Want to change | Go to |
|---|---|
| Colours, fonts, grid, sidebar width | `src/renderer/src/theme/tokens.css` (all values), `blueprint.css` (grid, corner marks) |
| Presets, slider limits, defaults | `config/presets.ts`, `config/fx.ts` |
| Keyboard shortcuts | `config/shortcuts.ts` (+ actions in `features/player/useShortcuts.ts`) |
| Audio chain (speed, reverb, damping) | `audio/chain.ts` (shared live + export), `audio/reverb.ts` (impulse maths), `audio/engine.ts` (live element) |
| Playlist / drop / folders | `features/library/*`, scan in `src/main/scan.ts` |
| Playback state | `features/player/player.store.ts` |
| Version panel UI | `features/fx/FxPanel.tsx`, state `fx.store.ts` |
| Saving to disk, per-track memory, engine<->store glue | `src/renderer/src/wire.ts` (only cross-cutting file) |
| New OS capability | add IPC in `src/main/index.ts` + expose in `src/preload/index.ts` + type in `global.d.ts` |

Audio chain: `<audio>` -> dry ---------------------> out -> speakers
                         -> convolver -> lowpass -> wet -> out
Slowed sound = `playbackRate` with `preservesPitch=false`. A/B key `B` bypasses to original.
Data: `~/Library/Application Support/slowverb/library.json`. Media served by `media://local/<path>` (CORS + range, needed for Web Audio and seeking).
Screenshot/audio harness: `SLOWVERB_SHOT=out.png SLOWVERB_DIR=<folder of audio> npx electron .` (src/main/devshot.ts) prints peak level, rate, seek result.
Known: streamed media reports Infinity duration, so UI uses the tag duration (useAudioTime.ts).
Plan: ~/.claude/plans/sequential-pondering-blum.md (phase 3 export DONE; 4 library polish and 5 settings/themes still to do). Export: audio/offline.ts + wav.ts, main/export.ts; harness runs a null-test..
Icon: `build/icon.svg` is the source; `npx electron build/render-icon.cjs` regenerates icon.png + icon.icns, then `npm run deploy`.
Corner softness: `--radius-sm/--radius/--radius-lg` in theme/tokens.css (0 = sharp).
Live editing: `npm run live` opens a window that hot-reloads on every save (UI changes instantly; main-process changes restart the app). Use it instead of the installed app while editing; run `npm run deploy` when happy.
Playlists = folders: library root is `~/Music/Slowverb` (shared/config.ts). main/playlists.ts does all file ops (create/rename/trash/move/import + folder watcher); renderer `features/playlists/` (store + PlaylistTree). Drops COPY into the selected playlist (IMPORT_MODE in shared/config.ts); downloads land in the selected playlist's folder. `useFlip` (ui/useFlip.ts) + the sliding highlight come from the Forge plugin's list-motion / slide-pill ideas. Harness: SLOWVERB_ROOT=<dir> SLOWVERB_PL=1 runs a playlist file-ops test.

## Timeline editor (Editor tab, Premiere-style)
Contract + design: `src/renderer/src/editor/CONTRACT.md`, plan `~/.claude/plans/sequential-pondering-blum.md`. Non-destructive: an edit is JSON at `<playlist>/.edits/<Song>/<Version>.json` (source file untouched); RENDER writes `Song (Version).wav` into the playlist.
| Want to change | Go to |
|---|---|
| Cutting rules (split/ripple/trim/overwrite/snap), undo | `editor/ops.ts` (+ opsEdit, opsTrim, clipmath, snap.ts, history.ts); tests beside them |
| Live playback + render (same graph) | `editor/schedule.ts`, `transport.ts`, `render.ts`, `peaks.ts`, knobs `config/editorAudio.ts` |
| Editor state, keys, header, tools, track list | `editor/editor.store.ts`, `useEditorKeys.ts` + `config/editorKeys.ts`, `editor/ui/{EditorView,HeaderBar,ToolStrip,TrackHeaders}.tsx` |
| Timeline drawing + mouse interactions | `editor/ui/Timeline.tsx`, `Ruler`, `ClipView`, `useTimelineInput`, `timelineDrags.ts`, knobs `config/timeline.ts`, look `timeline.css` |
| Sidecar saves, rename song, save render | `src/main/editor.ts` + `editorPaths.ts` (IPC `editor:*`) |
Harness: `SLOWVERB_ED=1` audio proofs; `SLOWVERB_EDUI=<song path>` scripted edit + screenshot (add `SLOWVERB_RENDER=1` to render, `SLOWVERB_ROOT=<dir>` to keep it off your real library).
Done: phases 1-2 (shell, playback, render, razor/split/delete/ripple/move/trim/undo/snap). Not yet: fade-handle dragging, crossfades UI, source bin, markers UI polish, BPM grid, peaks cache, rename UI polish (phases 3-5).
Harness safety: SLOWVERB_ED/EDUI/PL refuse to run unless SLOWVERB_ROOT points at a temp folder (a test once left cuts in the real Helium edit).

### Editor wave 2 (Premiere-speed features)
Contract: `editor/CONTRACT2.md`. Range/ripple/crossfade/speed ops: `ops2.ts opsRange.ts opsFade.ts opsSpeed.ts` (re-exported by ops.ts). Audio: `analysis.ts bpm.ts meter.ts` (+ peaks cache via `cachedPeaks`), transport loop/scrub/shuttle. Commands + keys: `editor/commands.ts`, defaults `config/editorKeys.ts` (DEFAULT_KEYS; user overrides in localStorage), palette Cmd+Shift+P, shortcuts Cmd+Alt+K. Docked panels: `editor/ui/panels/*` (Inspector, Source bin, Markers, Mix, BPM). Timeline extras: `Minimap.tsx BeatGrid.tsx TimeField.tsx useRulerInput.ts useDropTarget.ts`. Label colours: one palette in `config/timeline.ts` (panels.ts derives from it).
Known unverified by hand: mouse tools (fade handles, rolling edit, rate stretch, drop from source bin), 60fps (harness caps rAF at 30), Helium BPM guess (91, confidence 0.21).

### Editor wave 3 (DaVinci-style)
Contract: `editor/CONTRACT3.md`. Ops: `opsEnv.ts` (volume envelope, mute/gain/fade range, fade curves), `opsRangeEdit.ts` (extendEdit, trim to playhead, split many, cut every N beats, trim ends). Audio: schedule.ts applies curves + envelope + smooth-cut micro-fades; `sections.ts` (detectSections/Silence). Store: `storeRange.ts`, `storeAuto.ts`. UI: `RangeLayer.tsx EnvLayer.tsx FadeHandles.tsx envMath.ts useRangeInput.ts useFadeEnvInput.ts timeline3.css`; panels: `InspectorExtras.tsx Auto.tsx`. Keys: R range, Shift+R rate stretch, E extend edit, Shift+[ / Shift+] trim to playhead, Alt+M mute range, Alt+Up/Down gain, Alt+F / Alt+Shift+F fades, Cmd+\ split, Shift+Z fit, Alt+6 Auto tab.
Harness: `SLOWVERB_EDUI3=<song>` (with SLOWVERB_ROOT temp) drives envelope/curve/mute/sections and prints EDUI3_RESULT.
Known unverified by hand: side-drag fades and rubber band with a real mouse (agent drove them over CDP), mute leaves a hard-edged envelope step that the scheduler smooths.
Zoom: X zoom in, Z zoom out (Alt+Z = zoom tool); mouse wheel zooms at the cursor, Shift+wheel or sideways swipe scrolls left/right, Alt+wheel scrolls tracks vertically (TL.wheelMode in config/timeline.ts). Output stream: config/audioOutput.ts (latencyHint playback for Bluetooth), idle context suspended while the other plays.
Editor master: project.master null (default) = FOLLOW the player version for that song (editor/master.ts masterOf + fallback set in wire.ts); an Fx = explicit mix from the Mix panel; A/B ORIGINAL sets an explicit unity Fx.
Player<->editor hand-over: editor/sync.ts maps song seconds <-> timeline seconds; editor.store carryIn/carryOut keep the same moment and play state when switching views. media:// now serves proper HTTP Range (src/main/index.ts) so m4a/mp3 seeking works.
Bounce in place: store.bounceSelection (editor.store.ts), IPC editor:bounce -> <song folder>/.edits/<Song>/bounces/*.wav (hidden from the library), command bounce = Cmd+Alt+B, also in the clip right-click menu. Bakes clip fades/gain/volume line/speed/crossfades/track gain; master Version stays live. Harness: SLOWVERB_BOUNCE=<song> with SLOWVERB_ROOT temp.
Player plays the CURRENT EDIT: player.store viaEdit routes play/seek/pause through the editor transport when the song has a non-pristine edit (editor/pristine.ts); editor.close() hands the live transport to the player (adoptEdit); editor.prepare(path) loads a saved edit without opening the tab. Player export renders the edit when viaEdit.
Saving: editor edits autosave 300ms after every change (editor.store schedule/flush), library/playlist state 250ms, plus save on blur/hide and a close handshake (main waits for app:save-now -> app:saved, max 4s). Failed saves retry every 2s. Not persisted: undo history, zoom/scroll/tool/selection.

### Loop clips + track FX (waves 4+)
Contract: `editor/CONTRACT4.md`. A Loop is a record (Project.loops) expanded into overlapping repeat clips on ONE track (Clip.loop = Loop.id); playback/render need nothing special. Ops: `opsLoop.ts`, consistency in `loopSync.ts`/`validateLoops.ts`; store `storeLoop.ts` (makeLoopFromSelection, updateLoopLive, nudgeLoop, loopFillToPlayhead, unloopSelection); UI `ui/LoopLayer.tsx useLoopInput.ts loopMath.ts` (timeline) and `ui/panels/InspectorLoop.tsx LoopWave.tsx` (Inspector). Keys: Alt+L loop clip, Alt+Shift+L unloop, Alt+[ ] / Alt+Shift+[ ] nudge start/end 1 ms (Cmd+Alt = 10 ms). Knobs `EDITOR.loop` in config/editorKeys.ts. Harness: SLOWVERB_LOOP=<song>.
Track FX: Track.fx = 3-band EQ (dB) + reverb send; `editor/trackFx.ts` wires it after the track gain in schedule.ts; UI `ui/TrackFx.tsx` (FX button on each track header); store setTrackFx/resetTrackFx; knobs TRACK_EQ/TRACK_REVERB in config/editorAudio.ts. Harness: SLOWVERB_TRACKFX=<wav>.

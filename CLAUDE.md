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

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

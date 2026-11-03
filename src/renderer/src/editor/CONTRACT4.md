# Editor contract, wave 4: Loop clips (replaces hand-built A1/A2 crossfade chains)
Read first: ~/Projects/slowverb/CLAUDE.md, CONTRACT.md..CONTRACT3.md (implemented), editor/model.ts (new: Loop type, Project.loops, Clip.loop).
User wish: "I loop clips by duplicating onto two tracks with fade overlap; is there a better way? A loop mode where I can micro-adjust the begin and end points along with the fade in/out overlap."
Rules as before: greyscale blueprint look, no em dashes, never rm (use ~/.Trash), do NOT git commit, touch ONLY your files, typecheck your files + `npm test`, harness runs MUST set SLOWVERB_ROOT to a temp folder (now fully isolated). Files < ~200 lines, tunables in config/.
Idea: a Loop is stored as a small record; it is expanded into ordinary clips on ONE track (repeat i starts at start + i*(len - xfade); every repeat has fadeIn = fadeOut = xfade, equal-power; the crossfades are same-track overlaps which validate() already allows). Playback and render need NO changes. Changing the Loop numbers regenerates the clips (one undo step per gesture).

## Agent E3 (ops: editor/opsLoop.ts, ops.ts re-export, validate.ts if needed, tests)
All pure, return a NEW Project.
- loopLen(l: Loop): number                                   // srcOut - srcIn
- loopSpan(l: Loop): number                                  // count*(len - xfade) + xfade
- makeLoop(p, clipId: string, count?: number, xfade?: number): Project   // turn a clip into a live Loop: defaults count 4, xfade = min(0.05, len*0.1); the clip is replaced by the repeats (same track, same start, same srcIn/srcOut, speed folded in only if 1, else refuse); clip.gain/name kept
- updateLoop(p, loopId: string, patch: Partial<Pick<Loop,'srcIn'|'srcOut'|'count'|'xfade'|'start'|'gain'>>): Project   // regenerate the repeat clips; clamp: 0 <= srcIn < srcOut <= source duration, len >= MIN_CLIP*4, 0 <= xfade <= len/2 (and <= len/2 even with count 1), count 1..LOOP_MAX (200), start >= 0; repeats overwrite whatever is under them on that track like moveClips does; locked track refuses; returns p unchanged if nothing changes
- loopFill(p, loopId: string, endTime: number): Project      // choose count so the loop reaches (or just passes) endTime
- unloop(p, loopId: string): Project                         // keep the repeat clips as plain clips, drop the Loop record
- loopOfClip(p, clipId: string): Loop | undefined
- loopClips(p, loopId: string): Clip[]                       // the repeat clips, in order
- Any OTHER op that touches a repeat clip (split, trim, delete, move of only some of them, speed, paste...) must leave the project valid: it simply detaches the touched clips (remove their Clip.loop) and drops the Loop record when no member remains. moveClips of ALL members of a loop together must keep it live and update Loop.start (and Loop.track when moved to another track).
- Nudge helper: nudgeLoopPoint(p, loopId, which: 'in' | 'out', dt: number): Project   // microsecond-safe: moves srcIn or srcOut by dt seconds, keeps len >= minimum, then updateLoop
Include seeded random sequence tests mixing loops with existing ops asserting validate(p) empty and that every Clip.loop refers to an existing Loop.

## Agent G6 (store + commands + Inspector loop section: editor/storeLoop.ts, editor.store.ts, storeTypes.ts, commands.ts, config/editorKeys.ts, ui/panels/InspectorLoop.tsx, ui/panels/Inspector.tsx (mount only), ui/panels/panels.css)
Store (exact names; agent H3 codes against them):
 - makeLoopFromSelection(count?: number, xfade?: number): void
 - updateLoopLive(loopId: string, patch: Partial<Pick<Loop,'srcIn'|'srcOut'|'count'|'xfade'|'start'|'gain'>>, coalesceKey?: string): void   // continuous gestures pass a coalesceKey so a whole drag/slider/nudge-burst is ONE undo step (use the existing coalesce helper)
 - nudgeLoop(which: 'in' | 'out' | 'both', dt: number): void  // on the selected loop
 - loopFillToPlayhead(): void; unloopSelection(): void; selectedLoop(): Loop | undefined
Commands (no key collisions; palette + context menu): `loop.make` Alt+L (Loop clip), `loop.unloop` Alt+Shift+L, `loop.in-` / `loop.in+` / `loop.out-` / `loop.out+` Alt+[ / Alt+] / Alt+Shift+[ / Alt+Shift+] nudging 1 ms (hold Shift for 10 ms, handled in the command via a `fine` flag or separate ids), `loop.fill` (loop to playhead), `loop.count+` / `loop.count-`. Toasts say what changed ("Loop x6, crossfade 40 ms").
Inspector LOOP section (shown when the selection is a loop member, or a single plain clip with a MAKE LOOP button): number fields with ms resolution and +/- steppers (click = 1 ms, Shift-click = 10 ms, hold repeats): START point, END point (both shown as source time m:ss.mmm), LENGTH (read only), CROSSFADE ms, REPEATS, LEVEL; a MiniWave (reuse ui/panels/MiniWave.tsx) of the source around the loop points with two draggable handles for begin/end and a zoom control so points can be set to the sample; buttons: LOOP TO PLAYHEAD, UNLOOP. All edits call updateLoopLive with a coalesce key.

## Agent H3 (timeline visuals: editor/ui/ClipView.tsx, Timeline.tsx, timelineMenus.ts, config/timeline.ts, timeline3.css, new ui/LoopLayer.tsx)
- Repeat clips of a loop render as one visual group: a thin outline around the whole loop span, a badge "LOOP x6" (count and crossfade ms) at its top-left, repeat boundaries drawn as soft dividers inside the crossfade zones; the crossfade overlap zone between repeats is shaded (X shape).
- Selecting any repeat selects the whole loop (all member ids) and the Inspector shows the loop.
- Timeline handles for the SELECTED loop (data-loop-handle): a start-point handle and an end-point handle drawn on the first repeat's waveform edges, and a crossfade handle between the first two repeats; dragging calls updateLoopLive with a coalesce key; they glide (no snapping unless Cmd held), Alt = fine (0.1x). A drag handle on the loop's right end changes REPEATS (count) in whole steps with a live preview.
- Right-click menu items on a repeat: Loop settings, Unloop, Loop to playhead. A new context entry on a plain clip: Loop clip.

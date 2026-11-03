import { EDITOR } from '../config/editorKeys'
import type { Loop, Project } from './model'
import * as ops from './ops'
import type { Ctx, LoopKeys, S } from './storeTypes'
import { fmtTime } from './timefmt'

/** The Loop that the selection belongs to (first selected repeat clip), if any. Pure, so panels can subscribe with it. */
export function loopOfSelection(p: Project | null, selection: string[]): Loop | undefined {
  if (!p?.loops?.length) return undefined
  for (const id of selection) {
    const lp = p.clips.find((c) => c.id === id)?.loop
    const hit = lp && p.loops.find((l) => l.id === lp)
    if (hit) return hit
  }
  return undefined
}

const ms = (sec: number) => `${+(sec * 1000).toFixed(1)} ms`
/** "Loop x6, crossfade 40 ms" */
export const loopLabel = (l: Loop) => `Loop x${l.count}, crossfade ${ms(l.xfade)}`
const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** Loop clips: one Loop record that the ops expand into crossfaded repeat clips on a single track. */
export function loopActions({ get, set, toast, edit, coalesce }: Ctx): Pick<S, LoopKeys> {
  const selected = () => loopOfSelection(get().project, get().selection)
  const find = (id: string) => get().project?.loops?.find((l) => l.id === id)
  /** Regenerated repeats may carry new ids: keep the whole loop selected. */
  const reselect = (id: string) => {
    const p = get().project; if (!p?.loops?.some((l) => l.id === id)) return
    const ids = ops.loopClips(p, id).map((c) => c.id)
    if (ids.length && !sameIds(ids, get().selection)) set({ selection: ids })
  }
  const need = (): Loop | undefined => { const l = selected(); if (!l) get().showToast('Select a loop first (⌥L makes one from a clip)'); return l }

  return {
    selectedLoop: selected,

    makeLoopFromSelection(count = EDITOR.loop.defaultCount, xfade) {
      const { project: p, selection } = get(); if (!p) return
      if (selected()) return toast('Already a loop. Edit it in the Inspector')
      if (selection.length !== 1) return toast('Select one clip to loop')
      const before = new Set((p.loops ?? []).map((l) => l.id))
      const ok = edit((q) => ops.makeLoop(q, selection[0], count, xfade), () => { const l = get().project?.loops?.find((x) => !before.has(x.id)); return l ? loopLabel(l) : 'Looped' },
        'Cannot loop this clip (locked track, or its speed is not 100%)')
      if (!ok) return
      const made = get().project?.loops?.find((l) => !before.has(l.id)); if (made) reselect(made.id)
    },

    updateLoopLive(loopId, patch, coalesceKey) {
      const was = selected()?.id === loopId
      if (coalesceKey) coalesce(coalesceKey, (p) => ops.updateLoop(p, loopId, patch)); else get().apply((p) => ops.updateLoop(p, loopId, patch))
      if (was) reselect(loopId)
    },

    nudgeLoop(which, dt) {
      const l = need(); if (!l) return
      const key = `loopnudge:${l.id}:${which}`, before = find(l.id)
      coalesce(key, (p) => {
        if (which !== 'both') return ops.nudgeLoopPoint(p, l.id, which, dt)
        // moving the whole window: lead with the edge that goes first so the length never dips below the minimum
        return dt > 0 ? ops.nudgeLoopPoint(ops.nudgeLoopPoint(p, l.id, 'out', dt), l.id, 'in', dt) : ops.nudgeLoopPoint(ops.nudgeLoopPoint(p, l.id, 'in', dt), l.id, 'out', dt)
      })
      const now = find(l.id)
      if (!now || now === before) return toast(`Loop ${which === 'out' ? 'end' : 'start'} cannot move further`)
      reselect(l.id)
      toast(which === 'in' ? `Loop start ${fmtTime(now.srcIn)}` : which === 'out' ? `Loop end ${fmtTime(now.srcOut)}` : `Loop moved to ${fmtTime(now.srcIn)}`)
    },

    loopFillToPlayhead() {
      const l = need(); if (!l) return
      const t = get().now()
      if (t <= l.start) return toast('Move the playhead past the start of the loop first')
      edit((p) => ops.loopFill(p, l.id, t), () => { const n = find(l.id); return n ? `${loopLabel(n)}, filled to ${fmtTime(t)}` : 'Loop filled' }, 'Loop already reaches the playhead')
      reselect(l.id)
    },

    detachLastRepeat() {
      const l = need(); if (!l) return
      let id: string | undefined
      if (edit((p) => { const q = ops.detachLastRepeat(p, l.id); id = ops.loopClips(p, l.id).at(-1)?.id; return q }, 'Last repeat is now a normal clip: trim or extend it', 'Cannot detach (locked track?)') && id) get().select([id])
    },
    unloopSelection() {
      const l = need(); if (!l) return
      edit((p) => ops.unloop(p, l.id), `Unlooped: ${l.count} plain clip${l.count === 1 ? '' : 's'}`, 'Cannot unloop (locked track?)')
    }
  }
}

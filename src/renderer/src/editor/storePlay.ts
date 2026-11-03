import { EDITOR } from '../config/editorKeys'
import { projectEnd } from './model'
import type { Ctx, PlayKeys, S } from './storeTypes'
import { editorTransport } from './transport'

/** Transport-flavoured store actions: loop, play range, scrub, JKL shuttle. */
export function editPlayActions({ get, set, toast, stopPlayback }: Ctx, syncLoop: () => void): Pick<S, PlayKeys> {
  let kHeld = false
  return {
    toggleLoop() { set({ loop: !get().loop }); syncLoop(); toast(get().loop ? 'Loop on' : 'Loop off') },
    playRange() {
      const { project, buffers, markIn: a, markOut: b } = get(); if (!project) return
      if (a === null || b === null || b <= a) return toast('Set In and Out first (I and O)')
      stopPlayback(); syncLoop(); set({ playing: true, playhead: a })
      void Promise.resolve(editorTransport.playRange(project, buffers, a, b)).catch((e) => { console.error('[editor] playRange failed', e); set({ playing: false }) })
      toast('Playing In to Out')
    },
    scrubTo(t) {
      const { project, buffers, playing } = get(); if (!project) return
      const pos = Math.max(0, t); set({ playhead: pos })
      editorTransport.seek(project, buffers, pos)
      if (!playing) editorTransport.scrub(project, buffers, pos)
    },
    shuttleHold(held) { kHeld = held },
    shuttleKey(dir) {
      const { project, buffers, shuttle } = get(); if (!project) return
      if (dir === 0) { stopPlayback(); set({ shuttle: 0 }); return }
      const steps = EDITOR.shuttleSteps, i = Math.sign(shuttle) === dir ? steps.indexOf(Math.abs(shuttle) as (typeof steps)[number]) : -1
      const rate = kHeld ? dir * EDITOR.shuttleSlow : dir * steps[Math.min(steps.length - 1, i + 1)]
      void (async () => {
        if (!get().playing) {
          syncLoop()
          const { playhead } = get(), end = projectEnd(project), from = dir > 0 && playhead >= end - EDITOR.edgeEps ? 0 : playhead
          set({ playing: true, playhead: from })
          try { await editorTransport.play(project, buffers, from) } catch (e) { console.error('[editor] shuttle failed', e); set({ playing: false }); return }
        }
        editorTransport.setRate(rate); set({ shuttle: rate }); toast(`Shuttle ${rate}x`)
      })()
    }
  }
}

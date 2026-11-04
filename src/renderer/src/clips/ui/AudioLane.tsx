import { memo, type PointerEvent as RPointerEvent } from 'react'
import { CLIPS } from '../../config/clips'
import { trackColor } from '../../config/timeline'
import { useEditor } from '../../editor/editor.store'
import { clipDur } from '../../editor/model'
import BeatGrid from '../../editor/ui/BeatGrid'
import ClipView from '../../editor/ui/ClipView'

type Props = { pps: number; scrollX: number; viewW: number }

/** The song on top of the Clips timeline: every audio clip of the edit on one read-only lane (waveform + beat grid), so cuts can be
 *  placed on the music. Click or drag on it to move the playhead. Editing the audio happens in the EDITOR tab. */
function AudioLane({ pps, scrollX, viewW }: Props) {
  const heard = useEditor((s) => s.full && s.sound()), peaks = useEditor((s) => s.peaks), showBeats = useEditor((s) => s.showBeats)
  if (!heard) return null
  const h = CLIPS.audioLaneH, pad = 6, x = (t: number) => t * pps - scrollX
  const seek = (e: RPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), go = (cx: number) => useEditor.getState().scrubTo(Math.max(0, (cx - r.left + scrollX) / pps))
    go(e.clientX); e.currentTarget.setPointerCapture(e.pointerId)
    const el = e.currentTarget, move = (ev: PointerEvent) => go(ev.clientX), up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up) }
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up)
  }
  const visible = heard.clips.filter((c) => x(c.start + clipDur(c)) >= 0 && x(c.start) <= viewW)
  return (
    <div className="cl-audio" style={{ height: h }} onPointerDown={seek} title="The song (edit it in the EDITOR tab). Click to move the playhead.">
      {showBeats && heard.bpm ? <BeatGrid project={heard} pps={pps} scrollX={scrollX} viewW={viewW} height={h} /> : null}
      {visible.map((c) => (
        <ClipView key={c.id} clip={c} y={pad / 2} h={h - pad} selected={false} locked dim={!!c.disabled} ghost={false} stripe={trackColor(0)}
          peaks={peaks.get(c.src)} pxPerSec={pps} scrollX={scrollX} viewW={viewW} />
      ))}
    </div>
  )
}
export default memo(AudioLane)

import { memo } from 'react'
import { CLIPS } from '../../config/clips'

export type ClipMedia = { thumb: string | null | undefined; frames?: string[]; srcDur: number; kind: 'image' | 'video' }
type Props = { media: ClipMedia; xL: number; w: number; h: number; viewW: number; pps: number; srcIn: number; speed: number }

/** Which filmstrip frame to show for a tile starting `tileX` px into the clip. Frames are spread evenly over the whole video. Pure. */
export function frameIndex(n: number, tileX: number, tileW: number, pps: number, srcIn: number, speed: number, srcDur: number): number {
  if (n <= 0 || !(srcDur > 0)) return 0
  const s = srcIn + ((tileX + tileW / 2) / pps) * speed
  return Math.min(n - 1, Math.max(0, Math.floor((s / srcDur) * n)))
}

/** Picture strip inside a visual clip: a still repeats its thumbnail; a video shows the frame for each tile's time (filmstrip).
 *  Only tiles on screen are rendered. */
function ClipThumbs({ media, xL, w, h, viewW, pps, srcIn, speed }: Props) {
  const tileW = Math.min(CLIPS.thumbTileW * 2, Math.max(CLIPS.thumbTileW, Math.round(h * 16 / 9)))   // one 16:9 frame per tile, within limits
  const frames = media.frames?.length ? media.frames : null, src = media.thumb
  if (!frames && !src) return null
  const first = Math.max(0, Math.floor(-xL / tileW)), last = Math.min(Math.ceil(w / tileW), Math.ceil((viewW - xL) / tileW))
  const tiles: number[] = []; for (let i = first; i < last; i++) tiles.push(i)
  return (
    <div className="tl-thumbs" aria-hidden>
      {tiles.map((i) => {
        const url = frames ? frames[frameIndex(frames.length, i * tileW, tileW, pps, srcIn, speed, media.srcDur)] : src!
        return <img key={i} src={url} alt="" draggable={false} style={{ transform: `translateX(${i * tileW}px)`, width: tileW, height: h }} />
      })}
    </div>
  )
}
export default memo(ClipThumbs)

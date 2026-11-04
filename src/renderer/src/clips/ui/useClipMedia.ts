import { useEffect, useMemo } from 'react'
import type { SourceInfo } from '../../editor/model'
import { useClips } from '../clips.store'
import { ensureFilmstrip } from '../filmstrip'
import type { ClipMedia } from './ClipThumbs'

/** Thumbnail info for every picture/video source of the edit (stable object per source, so memoised clips do not redraw).
 *  Asks for missing thumbnails and video filmstrips in the background. */
export function useClipMedia(sources: Record<string, SourceInfo> | undefined): Map<string, ClipMedia> {
  const thumbs = useClips((s) => s.thumbs), frames = useClips((s) => s.frames)
  const visual = useMemo(() => Object.entries(sources ?? {}).filter(([, s]) => !!s.kind), [sources])
  useEffect(() => {
    for (const [path, s] of visual) { useClips.getState().thumb(path); if (s.kind === 'video') void ensureFilmstrip(path, s.duration) }
  }, [visual])
  return useMemo(() => new Map(visual.map(([path, s]) => [path, { thumb: thumbs[path], frames: frames[path], srcDur: s.duration, kind: s.kind! }])), [visual, thumbs, frames])
}

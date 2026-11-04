import type { DlProgress } from '../../../shared/types'
import type { PinState, VisualItem } from '../../../shared/visualsModel'

/** Result of a picture/video download or Pinterest sync. note = plain-English explanation when something went wrong or was partial. */
export type FetchResult = { paths: string[]; error?: string; note?: string }
/** Clips-tab additions to window.api (preload/index.ts). */
export type ClipsApi = {
  visualsList(): Promise<VisualItem[]>
  visualsRoot(): Promise<string>
  visualsImport(paths: string[], group?: string): Promise<string[]>
  visualsThumb(path: string): Promise<string | null>
  frameGet(key: string): Promise<string | null>
  framePut(key: string, jpeg: ArrayBuffer): Promise<string>
  onVisualsChanged(cb: () => void): () => void
  /** Paste-a-link: picture/video file links are fetched, Pinterest links go to gallery-dl, anything else to yt-dlp (video). */
  mediaFetch(input: string, opts: { privateBoards: boolean; group?: string }): Promise<FetchResult>
  mediaCancel(): Promise<void>
  onMediaProgress(cb: (p: DlProgress) => void): () => void
  pinState(): Promise<PinState>
  pinSyncAll(opts: { privateBoards: boolean }): Promise<FetchResult>
  pinForget(url: string): Promise<PinState>
}

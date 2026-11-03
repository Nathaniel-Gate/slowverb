import type { DlProgress, Saved, ScanResult } from '../../shared/types'
declare global {
  interface Window {
    api: { pathFor(f: File): string; scan(p: string[]): Promise<ScanResult[]>; load(): Promise<Saved | null>; save(d: Saved): Promise<void>; download(url: string, toRel: string): Promise<{ paths?: string[]; error?: string }>; sync(): Promise<{ root: string; folders: string[]; files: string[] }>; createPlaylist(rel: string): Promise<void>; renamePlaylist(rel: string, name: string): Promise<string>; trashPlaylist(rel: string): Promise<void>; moveTrack(path: string, toRel: string): Promise<string>; importInto(paths: string[], toRel: string): Promise<string[]>; onLibraryChanged(cb: () => void): () => void; cancelDownload(): Promise<void>; onDownloadProgress(cb: (p: DlProgress) => void): () => void; exportAudio(name: string, data: ArrayBuffer): Promise<boolean> }
  }
}

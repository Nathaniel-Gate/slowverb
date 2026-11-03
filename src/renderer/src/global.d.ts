import type { DlProgress, Saved, ScanResult } from '../../shared/types'
declare global {
  interface Window {
    api: { pathFor(f: File): string; scan(p: string[]): Promise<ScanResult[]>; load(): Promise<Saved | null>; save(d: Saved): Promise<void>; download(url: string): Promise<{ paths?: string[]; error?: string }>; cancelDownload(): Promise<void>; onDownloadProgress(cb: (p: DlProgress) => void): () => void; exportAudio(name: string, data: ArrayBuffer): Promise<boolean> }
  }
}

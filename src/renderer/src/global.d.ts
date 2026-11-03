import type { Saved, ScanResult } from '../../shared/types'
declare global {
  interface Window {
    api: { pathFor(f: File): string; scan(p: string[]): Promise<ScanResult[]>; load(): Promise<Saved | null>; save(d: Saved): Promise<void> }
  }
}

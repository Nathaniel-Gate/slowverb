import type { Project } from './editor/model'
import type { DlProgress, Saved, ScanResult } from '../../shared/types'
declare global {
  interface Window {
    api: { pathFor(f: File): string; scan(p: string[]): Promise<ScanResult[]>; load(): Promise<Saved | null>; save(d: Saved): Promise<void>; download(url: string, toRel: string): Promise<{ paths?: string[]; error?: string }>; sync(): Promise<{ root: string; folders: string[]; files: string[] }>; createPlaylist(rel: string): Promise<void>; renamePlaylist(rel: string, name: string): Promise<string>; trashPlaylist(rel: string): Promise<void>; moveTrack(path: string, toRel: string): Promise<string>; importInto(paths: string[], toRel: string): Promise<string[]>; onLibraryChanged(cb: () => void): () => void; cancelDownload(): Promise<void>; onDownloadProgress(cb: (p: DlProgress) => void): () => void; exportAudio(name: string, data: ArrayBuffer): Promise<boolean>; editorList(song: string): Promise<string[]>; editorLoad(song: string, name: string): Promise<Project | null>; editorSave(song: string, project: Project): Promise<void>; editorDelete(song: string, name: string): Promise<void>; editorRenameVersion(song: string, from: string, to: string): Promise<void>; renameSong(song: string, newBaseName: string): Promise<string>; saveRender(song: string, versionName: string, wav: ArrayBuffer): Promise<string> }
  }
}

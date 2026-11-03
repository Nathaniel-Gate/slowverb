import { contextBridge, ipcRenderer, webUtils } from 'electron'
// The only bridge between the UI and the OS. Add new capabilities here.
contextBridge.exposeInMainWorld('api', {
  pathFor: (f: File) => webUtils.getPathForFile(f),
  scan: (paths: string[]) => ipcRenderer.invoke('scan', paths),
  load: () => ipcRenderer.invoke('library:load'),
  save: (d: unknown) => ipcRenderer.invoke('library:save', d),
  download: (url: string, toRel: string) => ipcRenderer.invoke('dl:start', url, toRel),
  sync: () => ipcRenderer.invoke('pl:sync'),
  createPlaylist: (rel: string) => ipcRenderer.invoke('pl:create', rel),
  renamePlaylist: (rel: string, name: string) => ipcRenderer.invoke('pl:rename', rel, name),
  trashPlaylist: (rel: string) => ipcRenderer.invoke('pl:trash', rel),
  moveTrack: (path: string, toRel: string) => ipcRenderer.invoke('pl:move', path, toRel),
  importInto: (paths: string[], toRel: string) => ipcRenderer.invoke('pl:import', paths, toRel),
  onLibraryChanged: (cb: () => void) => { ipcRenderer.on('fs:changed', cb); return () => ipcRenderer.removeListener('fs:changed', cb) },
  cancelDownload: () => ipcRenderer.invoke('dl:cancel'),
  onDownloadProgress: (cb: (p: unknown) => void) => {
    const h = (_e: unknown, p: unknown) => cb(p); ipcRenderer.on('dl:progress', h); return () => ipcRenderer.removeListener('dl:progress', h)
  },
  exportAudio: (name: string, data: ArrayBuffer) => ipcRenderer.invoke('export:save', name, data)
})

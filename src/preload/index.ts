import { contextBridge, ipcRenderer, webUtils } from 'electron'
// The only bridge between the UI and the OS. Add new capabilities here.
contextBridge.exposeInMainWorld('api', {
  pathFor: (f: File) => webUtils.getPathForFile(f),
  scan: (paths: string[]) => ipcRenderer.invoke('scan', paths),
  load: () => ipcRenderer.invoke('library:load'),
  save: (d: unknown) => ipcRenderer.invoke('library:save', d),
  download: (url: string) => ipcRenderer.invoke('dl:start', url),
  onDownloadProgress: (cb: (p: { pct: number; stage: string }) => void) => {
    const h = (_e: unknown, p: { pct: number; stage: string }) => cb(p); ipcRenderer.on('dl:progress', h); return () => ipcRenderer.removeListener('dl:progress', h)
  },
  exportAudio: (name: string, data: ArrayBuffer) => ipcRenderer.invoke('export:save', name, data)
})

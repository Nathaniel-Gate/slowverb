import { contextBridge, ipcRenderer, webUtils } from 'electron'
// The only bridge between the UI and the OS. Add new capabilities here.
contextBridge.exposeInMainWorld('api', {
  pathFor: (f: File) => webUtils.getPathForFile(f),
  scan: (paths: string[]) => ipcRenderer.invoke('scan', paths),
  load: () => ipcRenderer.invoke('library:load'),
  save: (d: unknown) => ipcRenderer.invoke('library:save', d),
  exportAudio: (name: string, data: ArrayBuffer) => ipcRenderer.invoke('export:save', name, data)
})

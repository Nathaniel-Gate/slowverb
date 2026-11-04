import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import { extname, join } from 'path'
import { createReadStream } from 'fs'
import { stat } from 'fs/promises'
import { Readable } from 'stream'
import { readFile, writeFile } from 'fs/promises'
import { scan } from './scan'
import { exportSave } from './export'
import { cancelDownload, downloadAudio } from './ytdlp'
import { editorDelete, editorList, editorLoad, editorRenameVersion, editorSave, peaksGet, peaksPut, peaksStat, renameSong, saveBounce, saveRender } from './editor'
import { sendToPhone } from './phone'
import type { ListRef } from '../shared/phoneModel'
import { migrate, readLists, revealSong, trashSong, writeLists } from './library'
import { createFolder, importInto, moveFile, renameFolder, sync, trashFolder, watchLibrary } from './playlists'
import { runShot } from './devshot'

// media://local/<abs path> streams a file from disk with range support (seeking) and CORS (Web Audio needs it).
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
])

const MIME: Record<string, string> = { '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.aac': 'audio/aac', '.webm': 'audio/webm', '.aiff': 'audio/aiff' }
// Test runs (SLOWVERB_ROOT set) must never touch the real app data: a harness once wrote its test songs into the real library.json.
if (process.env.SLOWVERB_ROOT) app.setPath('userData', join(process.env.SLOWVERB_ROOT, '.userdata'))
const libraryFile = () => join(app.getPath('userData'), 'library.json')

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 720, minHeight: 480,
    backgroundColor: '#0a0a0a', titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 20, y: 18 },
    webPreferences: { autoplayPolicy: process.env.SLOWVERB_SHOT ? 'no-user-gesture-required' : 'document-user-activation-required', preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  let quitting = false
app.on('before-quit', () => { quitting = true })
// Never lose the last edit: before the window closes, ask the page to flush every pending save and wait (max 4s) for its answer.
  let closing = false
  win.on('close', (e) => {
    if (closing || win.isDestroyed()) return
    e.preventDefault(); closing = true
    const done = () => { ipcMain.removeListener('app:saved', done); clearTimeout(t); if (!win.isDestroyed()) win.close(); if (quitting) app.quit() }   // a quit that was paused for the save must finish afterwards
    const t = setTimeout(done, 4000)
    ipcMain.once('app:saved', done)
    win.webContents.send('app:save-now')
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

// ONE copy of the app: launching again just brings the open window forward (no stack of identical icons in the Dock).
if (app.isPackaged && !process.env.SLOWVERB_ROOT && !app.requestSingleInstanceLock()) app.quit()
app.on('second-instance', () => { const w = BrowserWindow.getAllWindows()[0]; if (w) { if (w.isMinimized()) w.restore(); w.focus() } })

app.whenReady().then(() => {
  // The live dev window runs inside Electron's own app bundle, so give it our icon in the Dock too (the packaged app already has it).
  // Test runs (SLOWVERB_ROOT) must not add Dock icons; the live dev window gets our icon.
  if (process.platform === 'darwin') { if (process.env.SLOWVERB_ROOT) app.dock?.hide(); else if (!app.isPackaged) app.dock?.setIcon(join(__dirname, '../../build/icon.png')) }
  // Serve the file ourselves with proper Range support: without 206 + Content-Range + Content-Length, Chromium cannot seek inside
  // m4a/mp3 (a seek jumps back to the start and the duration reads as Infinity).
  protocol.handle('media', async (req) => {
    const file = decodeURIComponent(new URL(req.url).pathname)
    const st = await stat(file).catch(() => null)
    if (!st) return new Response('not found', { status: 404 })
    const size = st.size
    const base = { 'Accept-Ranges': 'bytes', 'Content-Type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' }
    const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') ?? '')
    if (m && (m[1] || m[2])) {
      const start = m[1] ? +m[1] : Math.max(0, size - +m[2]), end = Math.min(m[1] && m[2] ? +m[2] : size - 1, size - 1)
      if (start > end || start >= size) return new Response(null, { status: 416, headers: { ...base, 'Content-Range': `bytes */${size}` } })
      return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, { status: 206, headers: { ...base, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
    }
    return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { status: 200, headers: { ...base, 'Content-Length': String(size) } })
  })
  ipcMain.handle('scan', (_e, paths: string[]) => scan(paths))
  ipcMain.handle('dl:start', async (e, url: string, toRel: string) => {
    try { return { paths: await downloadAudio(url, (p) => e.sender.send('dl:progress', p), toRel) } }
    catch (err) { return { error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('pl:sync', () => sync())
  ipcMain.handle('pl:create', (_e, rel: string) => createFolder(rel))
  ipcMain.handle('pl:rename', (_e, rel: string, name: string) => renameFolder(rel, name))
  ipcMain.handle('pl:trash', (_e, rel: string) => trashFolder(rel))
  ipcMain.handle('pl:move', (_e, path: string, toRel: string) => moveFile(path, toRel))
  ipcMain.handle('pl:import', (_e, paths: string[], toRel: string) => importInto(paths, toRel))
  ipcMain.handle('lib:migrate', () => migrate(libraryFile(), async (n) => {
    if (process.env.SLOWVERB_ROOT) return true   // test harness: no dialog
    const r = await dialog.showMessageBox({ type: 'question', buttons: ['Organise', 'Not now'], defaultId: 0, cancelId: 1, message: 'Organise your library into Songs and Sound bites?',
      detail: `${n} file${n === 1 ? '' : 's'} will move into the Songs folder. Your old playlist folders become playlists. Nothing is deleted and a backup is saved first.` })
    return r.response === 0
  }))
  ipcMain.handle('lists:load', () => readLists())
  ipcMain.handle('lists:save', (_e, lists) => writeLists(lists))
  ipcMain.handle('lib:reveal', (_e, path: string) => revealSong(path))
  ipcMain.handle('lib:trash', (_e, path: string) => trashSong(path))
  ipcMain.handle('editor:list', (_e, song: string) => editorList(song))
  ipcMain.handle('editor:load', (_e, song: string, name: string) => editorLoad(song, name))
  ipcMain.handle('editor:save', (_e, song: string, project) => editorSave(song, project))
  ipcMain.handle('editor:delete', (_e, song: string, name: string) => editorDelete(song, name))
  ipcMain.handle('editor:rename', (_e, song: string, from: string, to: string) => editorRenameVersion(song, from, to))
  ipcMain.handle('editor:renameSong', (_e, song: string, base: string) => renameSong(song, base))
  ipcMain.handle('phone:send', (_e, rel: string, title: string, wav: ArrayBuffer, lists: ListRef[]) => sendToPhone(rel, title, wav, lists))
  ipcMain.handle('editor:bounce', (_e, song: string, name: string, wav: ArrayBuffer) => saveBounce(song, name, wav))
  ipcMain.handle('editor:render', (_e, song: string, name: string, wav: ArrayBuffer) => saveRender(song, name, wav))
  ipcMain.handle('peaks:get', (_e, key: string) => peaksGet(key))
  ipcMain.handle('peaks:put', (_e, key: string, data: ArrayBuffer) => peaksPut(key, data))
  ipcMain.handle('peaks:stat', (_e, path: string) => peaksStat(path))
  ipcMain.handle('dl:cancel', () => cancelDownload())
  ipcMain.handle('export:save', (e, name: string, data: ArrayBuffer) => exportSave(BrowserWindow.fromWebContents(e.sender)!, name, data))
  ipcMain.handle('library:load', async () => { try { return JSON.parse(await readFile(libraryFile(), 'utf8')) } catch { return null } })
  ipcMain.handle('library:save', (_e, data) => writeFile(libraryFile(), JSON.stringify(data)))
  const win = createWindow()
  watchLibrary(win)
  if (process.env.SLOWVERB_SHOT) runShot(win)
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { readFile, writeFile } from 'fs/promises'
import { scan } from './scan'
import { exportSave } from './export'
import { downloadAudio } from './ytdlp'
import { runShot } from './devshot'

// media://local/<abs path> streams a file from disk with range support (seeking) and CORS (Web Audio needs it).
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true, corsEnabled: true } }
])

const libraryFile = () => join(app.getPath('userData'), 'library.json')

function createWindow() {
  const win = new BrowserWindow({
    width: 1100, height: 720, minWidth: 720, minHeight: 480,
    backgroundColor: '#0a0a0a', titleBarStyle: 'hiddenInset',
    webPreferences: { autoplayPolicy: process.env.SLOWVERB_SHOT ? 'no-user-gesture-required' : 'document-user-activation-required', preload: join(__dirname, '../preload/index.js'), sandbox: false }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(__dirname, '../renderer/index.html'))
  return win
}

app.whenReady().then(() => {
  protocol.handle('media', async (req) => {
    const res = await net.fetch(pathToFileURL(decodeURIComponent(new URL(req.url).pathname)).toString(), { headers: req.headers, method: req.method })
    const h = new Headers(res.headers); h.set('Access-Control-Allow-Origin', '*')
    return new Response(res.body, { status: res.status, headers: h })
  })
  ipcMain.handle('scan', (_e, paths: string[]) => scan(paths))
  ipcMain.handle('dl:start', async (e, url: string) => {
    try { return { paths: await downloadAudio(url, (pct, stage) => e.sender.send('dl:progress', { pct, stage })) } }
    catch (err) { return { error: err instanceof Error ? err.message : String(err) } }
  })
  ipcMain.handle('export:save', (e, name: string, data: ArrayBuffer) => exportSave(BrowserWindow.fromWebContents(e.sender)!, name, data))
  ipcMain.handle('library:load', async () => { try { return JSON.parse(await readFile(libraryFile(), 'utf8')) } catch { return null } })
  ipcMain.handle('library:save', (_e, data) => writeFile(libraryFile(), JSON.stringify(data)))
  const win = createWindow()
  if (process.env.SLOWVERB_SHOT) runShot(win)
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

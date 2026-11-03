import { BrowserWindow, app, dialog } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'

/** Save dialog + write. SLOWVERB_EXPORT_DIR skips the dialog (test harness only). Returns false if cancelled. */
export async function exportSave(win: BrowserWindow, name: string, data: ArrayBuffer): Promise<boolean> {
  const safe = name.replace(/[\/:]/g, '-')
  let file = process.env.SLOWVERB_EXPORT_DIR ? join(process.env.SLOWVERB_EXPORT_DIR, safe) : undefined
  if (!file) {
    const r = await dialog.showSaveDialog(win, { defaultPath: join(app.getPath('music'), safe), filters: [{ name: 'WAV audio', extensions: ['wav'] }] })
    if (r.canceled || !r.filePath) return false
    file = r.filePath
  }
  await writeFile(file, Buffer.from(data))
  return true
}

import { BrowserWindow, shell } from 'electron'
import { watch } from 'fs'
import { copyFile, mkdir, readdir, rename, stat } from 'fs/promises'
import { basename, dirname, extname, join, relative, sep } from 'path'
import { AUDIO_EXTS } from '../shared/types'
import { IMPORT_MODE } from '../shared/config'
import { libraryRoot } from './paths'

// A playlist IS a folder under the library root. Everything here is plain file operations, so Finder and the app always agree.
const isAudio = (p: string) => AUDIO_EXTS.includes(extname(p).slice(1).toLowerCase())
const safeName = (n: string) => n.replace(/[\/:\\]/g, '-').trim().replace(/^\.+/, '')
const inRoot = (rel: string) => { const p = join(libraryRoot(), rel); if (relative(libraryRoot(), p).startsWith('..')) throw new Error('Outside library'); return p }

export async function sync(): Promise<{ root: string; folders: string[]; files: string[] }> {
  const root = libraryRoot(); await mkdir(root, { recursive: true })
  const folders: string[] = [], files: string[] = []
  const walk = async (dir: string) => {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) { folders.push(relative(root, p)); await walk(p) } else if (isAudio(p)) files.push(p)
    }
  }
  await walk(root)
  return { root, folders, files }
}
export async function createFolder(rel: string) { await mkdir(inRoot(rel.split(sep).map(safeName).join(sep)), { recursive: true }) }
export async function renameFolder(rel: string, name: string) {
  const to = join(dirname(rel), safeName(name)); await rename(inRoot(rel), inRoot(to)); return to
}
export async function trashFolder(rel: string) { await shell.trashItem(inRoot(rel)) }   // recoverable from Trash
export async function moveFile(path: string, toRel: string) {
  const dest = await uniqueDest(inRoot(toRel), basename(path)); await rename(path, dest); return dest
}
async function uniqueDest(dir: string, name: string) {
  await mkdir(dir, { recursive: true })
  let dest = join(dir, name), n = 1
  while (await stat(dest).then(() => true, () => false)) dest = join(dir, `${basename(name, extname(name))} (${n++})${extname(name)}`)
  return dest
}
/** Files/folders from anywhere -> into a playlist folder (copy or move per IMPORT_MODE). Returns the new paths. */
export async function importInto(paths: string[], toRel: string): Promise<string[]> {
  const out: string[] = [], dir = inRoot(toRel)
  const take = async (p: string) => {
    const st = await stat(p).catch(() => null); if (!st) return
    if (st.isDirectory()) { for (const n of await readdir(p)) if (!n.startsWith('.')) await take(join(p, n)) }
    else if (isAudio(p)) {
      if (dirname(p) === dir) { out.push(p); return }
      const dest = await uniqueDest(dir, basename(p))
      if (IMPORT_MODE === 'move') await rename(p, dest); else await copyFile(p, dest)
      out.push(dest)
    }
  }
  for (const p of paths) await take(p)
  return out
}
/** Tell the UI when the library folder changes on disk (Finder edits, downloads). */
export function watchLibrary(win: BrowserWindow) {
  let t: NodeJS.Timeout | undefined
  try { watch(libraryRoot(), { recursive: true }, () => { clearTimeout(t); t = setTimeout(() => !win.isDestroyed() && win.webContents.send('fs:changed'), 500) }) } catch { /* root missing: created on first sync */ }
}

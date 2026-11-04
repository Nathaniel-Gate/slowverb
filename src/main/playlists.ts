import { BrowserWindow, shell } from 'electron'
import { watch } from 'fs'
import { copyFile, mkdir, readdir, rename, stat } from 'fs/promises'
import { CATEGORIES, VISUALS_DIR_NAME } from '../shared/config'
import { editsDir } from './editorPaths'
import { basename, dirname, extname, join, relative, sep } from 'path'
import { AUDIO_EXTS } from '../shared/types'
import { IMPORT_MODE } from '../shared/config'
import { libraryRoot } from './paths'

// A playlist IS a folder under the library root. Everything here is plain file operations, so Finder and the app always agree.
const isAudio = (p: string) => AUDIO_EXTS.includes(extname(p).slice(1).toLowerCase())
export const safeName = (n: string) => n.replace(/[\/:\\]/g, '-').trim().replace(/^\.+/, '')
export const inRoot = (rel: string) => { const p = join(libraryRoot(), rel); if (relative(libraryRoot(), p).startsWith('..')) throw new Error('Outside library'); return p }

export async function sync(): Promise<{ root: string; folders: string[]; files: string[] }> {
  const root = libraryRoot(); await mkdir(root, { recursive: true })
  for (const c of CATEGORIES) await mkdir(join(root, c), { recursive: true })   // the two homes always exist
  const folders: string[] = [], files: string[] = []
  const walk = async (dir: string) => {
    for (const e of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (e.name.startsWith('.') || (dir === root && e.name === VISUALS_DIR_NAME)) continue   // Visuals/ = the Clips tab's pictures, never audio
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
/** Move a song to another folder of the library, taking its editor sidecar (.edits/<song>) with it. Never overwrites. Returns the new path. */
export async function moveFile(path: string, toRel: string) {
  const dest = await uniqueDest(inRoot(toRel), basename(path)); await rename(path, dest)
  const from = editsDir(path), to = editsDir(dest)
  if (await stat(from).then(() => true, () => false) && !(await stat(to).then(() => true, () => false))) { await mkdir(dirname(to), { recursive: true }); await rename(from, to) }
  return dest
}
export async function uniqueDest(dir: string, name: string) {
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
  let tv: NodeJS.Timeout | undefined
  try { watch(libraryRoot(), { recursive: true }, (_ev, name) => { if (name && name.split(sep).some((s) => s.startsWith('.'))) return   // our own bookkeeping (.slowverb, .edits) is not a library change
     if (name && name.split(sep)[0] === VISUALS_DIR_NAME) { clearTimeout(tv); tv = setTimeout(() => !win.isDestroyed() && win.webContents.send('visuals:changed'), 500); return }   // pictures: the Clips tab's media list, not the audio library
     clearTimeout(t); t = setTimeout(() => !win.isDestroyed() && win.webContents.send('fs:changed'), 500) }) } catch { /* root missing: created on first sync */ }
}

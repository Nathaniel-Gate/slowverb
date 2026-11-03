import { shell } from 'electron'
import { mkdir, readdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { dirname, extname, join } from 'path'
import type { Project } from '../renderer/src/editor/model'
import { editsDir, renamedSongName, renderName, safeName, songBase, uniquePath, versionFile } from './editorPaths'

// Editor sidecars: plain JSON next to the song in a dot-folder, plain file ops like playlists.ts.
const exists = (p: string) => stat(p).then(() => true, () => false)

export async function editorList(song: string): Promise<string[]> {
  const dir = editsDir(song)
  const names = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json') && !f.startsWith('.'))
  const withTime = await Promise.all(names.map(async (f) => ({ f, t: (await stat(join(dir, f))).mtimeMs })))
  return withTime.sort((a, b) => b.t - a.t).map((x) => x.f.slice(0, -'.json'.length))
}
export async function editorLoad(song: string, name: string): Promise<Project | null> {
  try { return JSON.parse(await readFile(versionFile(song, name), 'utf8')) } catch { return null }
}
export async function editorSave(song: string, project: Project) {
  const dest = versionFile(song, project.name), tmp = `${dest}.tmp`
  await mkdir(dirname(dest), { recursive: true })
  await writeFile(tmp, JSON.stringify(project)); await rename(tmp, dest)   // atomic
}
export async function editorDelete(song: string, name: string) {
  const f = versionFile(song, name); if (await exists(f)) await shell.trashItem(f)
}
export async function editorRenameVersion(song: string, from: string, to: string) {
  const dest = versionFile(song, to), src = versionFile(song, from)
  if (dest === src) return
  if (await exists(dest)) throw new Error('A version with that name exists')
  const p = await editorLoad(song, from); if (!p) throw new Error('Version not found')
  await writeFile(dest, JSON.stringify({ ...p, name: safeName(to) })); await shell.trashItem(src)
}
export async function renameSong(song: string, newBaseName: string): Promise<string> {
  if (!safeName(newBaseName)) throw new Error('Empty name')
  const dest = await uniquePath(dirname(song), renamedSongName(song, newBaseName), exists)
  await rename(song, dest)
  const oldEdits = editsDir(song)
  if (await exists(oldEdits)) {
    const newEdits = editsDir(dest)   // unique file name means unique base, so no clash expected
    if (!(await exists(newEdits))) await rename(oldEdits, newEdits)
  }
  return dest
}
export async function saveRender(song: string, versionName: string, wav: ArrayBuffer): Promise<string> {
  const dest = await uniquePath(dirname(song), renderName(song, versionName), exists)
  await writeFile(dest, Buffer.from(wav)); return dest
}

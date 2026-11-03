import { app, shell } from 'electron'
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

// Waveform peaks cache: <userData>/peaks/<key>.pks (under SLOWVERB_ROOT/.peaks in the test harness, so tests never touch real app data).
// The key is built in the renderer (peaksKey: path hash + mtime + size), so an edited file simply misses.
const peaksDir = () => process.env.SLOWVERB_ROOT ? join(process.env.SLOWVERB_ROOT, '.peaks') : join(app.getPath('userData'), 'peaks')
const peaksFile = (key: string) => { const k = key.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120); if (!k) throw new Error('Empty peaks key'); return join(peaksDir(), `${k}.pks`) }
export async function peaksGet(key: string): Promise<ArrayBuffer | null> {
  try { const b = await readFile(peaksFile(key)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer } catch { return null }
}
export async function peaksPut(key: string, data: ArrayBuffer): Promise<void> {
  const dest = peaksFile(key), tmp = `${dest}.tmp`
  await mkdir(dirname(dest), { recursive: true }); await writeFile(tmp, Buffer.from(data)); await rename(tmp, dest)   // atomic
}
export async function peaksStat(path: string): Promise<{ mtimeMs: number; size: number } | null> {
  try { const s = await stat(path); return { mtimeMs: s.mtimeMs, size: s.size } } catch { return null }
}

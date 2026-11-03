import { shell } from 'electron'
import { copyFile, mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { basename, dirname, join, relative } from 'path'
import { CATEGORIES, LISTS_DIR } from '../shared/config'
import { makeList, addSongs, planMigration } from '../shared/libraryModel'
import type { Playlist } from '../shared/types'
import { editsDir } from './editorPaths'
import { moveFile, sync } from './playlists'
import { libraryRoot } from './paths'

// Library bookkeeping that is not "a file on disk": the virtual playlists, the one-time layout migration, reveal/trash of a song.
const dir = () => join(libraryRoot(), LISTS_DIR)
const listsFile = () => join(dir(), 'playlists.json')
const exists = (p: string) => stat(p).then(() => true, () => false)

export async function readLists(): Promise<Playlist[]> {
  try { const j = JSON.parse(await readFile(listsFile(), 'utf8')); return Array.isArray(j.playlists) ? j.playlists : [] } catch { return [] }
}
export async function writeLists(playlists: Playlist[]) {
  await mkdir(dir(), { recursive: true })
  if (await exists(listsFile())) await copyFile(listsFile(), listsFile() + '.bak')   // one step back if a bad read ever blanked the list
  const tmp = listsFile() + '.tmp'; await writeFile(tmp, JSON.stringify({ version: 1, playlists }, null, 1)); await rename(tmp, listsFile())   // atomic: never a half-written file
}

export async function revealSong(path: string) { shell.showItemInFolder(path) }
/** Move a song (and its editor sidecar folder) to the Trash; recoverable from there. */
export async function trashSong(path: string) {
  await shell.trashItem(path)
  const e = editsDir(path); if (await exists(e)) await shell.trashItem(e)
}

async function pruneEmpty(d: string): Promise<boolean> {
  let left = 0
  for (const e of await readdir(d, { withFileTypes: true })) {
    if (e.name === '.DS_Store') continue
    if (e.isDirectory() && await pruneEmpty(join(d, e.name))) continue
    left++
  }
  if (left) return false
  await unlink(join(d, '.DS_Store')).catch(() => {}); await rmdir(d).catch(() => { left++ })
  return left === 0
}

/** One-time move into Songs/ + Sound bites/ (see planMigration). Backs up library.json first, logs every move, never deletes a file.
 *  Returns absolute from/to pairs so the renderer can repoint its tracks. `confirm` lets the app ask first; declining changes nothing. */
export async function migrate(libraryJson: string, confirm: (moves: number) => Promise<boolean>): Promise<{ from: string; to: string }[]> {
  const root = libraryRoot(), marker = join(dir(), 'migrated.json')
  if (await exists(marker)) return []
  const { files } = await sync()
  const plan = planMigration(files.map((f) => relative(root, f)))
  await mkdir(dir(), { recursive: true })
  if (!plan.moves.length) { await writeFile(marker, JSON.stringify({ moved: 0, at: Date.now() })); return [] }
  if (!(await confirm(plan.moves.length))) return []
  const stamp = new Date().toISOString().replace(/[:.]/g, '-'), bk = join(dir(), `backup-${stamp}`)
  await mkdir(bk, { recursive: true })
  if (await exists(libraryJson)) await copyFile(libraryJson, join(bk, 'library.json'))
  const done: { from: string; to: string }[] = [], newRel = new Map<string, string>()
  for (const m of plan.moves) {
    const from = join(root, m.from), to = await moveFile(from, dirname(m.to))
    done.push({ from, to }); newRel.set(m.to, relative(root, to))
  }
  let lists = await readLists()
  for (const pl of plan.lists) {
    const songs = pl.songs.map((s) => newRel.get(s) ?? s), have = lists.find((l) => l.name === pl.name)
    lists = have ? lists.map((l) => (l === have ? addSongs(l, songs) : l)) : [...lists, addSongs(makeList(randomUUID(), pl.name, Date.now()), songs)]
  }
  await writeLists(lists)
  await writeFile(join(bk, 'moves.json'), JSON.stringify(done, null, 1))
  for (const e of await readdir(root, { withFileTypes: true }))   // old folder-playlists are empty now: tidy them away (only if truly empty)
    if (e.isDirectory() && !e.name.startsWith('.') && !(CATEGORIES as readonly string[]).includes(e.name)) await pruneEmpty(join(root, e.name))
  await writeFile(marker, JSON.stringify({ moved: done.length, at: Date.now(), backup: basename(bk) }))
  return done
}

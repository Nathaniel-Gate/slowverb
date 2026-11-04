import { shell } from 'electron'
import { copyFile, mkdir, readdir, readFile, rename, rmdir, stat, unlink, writeFile } from 'fs/promises'
import { randomUUID } from 'crypto'
import { basename, dirname, join, relative } from 'path'
import { CATEGORIES, LISTS_DIR, VISUALS_DIR_NAME } from '../shared/config'
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
  let text: string
  try { text = await readFile(listsFile(), 'utf8') } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []; throw e }   // no file yet = no playlists; any OTHER failure must not look like "empty"
  const j = JSON.parse(text)   // a corrupt file throws too, so the app never saves over it
  return Array.isArray(j.playlists) ? j.playlists : []
}
/** `cleared` = the user themselves deleted the last playlist. Without it, an empty list never replaces a non-empty file (whatever the cause: bad read, test harness, race), so playlists cannot be wiped by accident. */
export async function writeLists(playlists: Playlist[], cleared = false) {
  await mkdir(dir(), { recursive: true })
  if (!playlists.length && !cleared && (await readLists().catch(() => [{}])).length) return
  if (await exists(listsFile())) {
    await copyFile(listsFile(), listsFile() + '.bak')
    const had = await readLists().catch(() => [] as Playlist[])
    if (had.length) {   // a dated copy whenever real playlists are about to be replaced; the last 20 are kept, so one bad save can never erase them
      const bk = join(dir(), 'playlists-backups'); await mkdir(bk, { recursive: true })
      await copyFile(listsFile(), join(bk, `playlists-${new Date().toISOString().replace(/[:.]/g, '-')}.json`))
      const old = (await readdir(bk)).sort(); for (const f of old.slice(0, Math.max(0, old.length - 20))) await unlink(join(bk, f))
    }
  }
  const tmp = `${listsFile()}.${randomUUID()}.tmp`;   // unique per write: two saves at once (timer + quit) must not fight over one temp file
   await writeFile(tmp, JSON.stringify({ version: 1, playlists }, null, 1)); await rename(tmp, listsFile())   // atomic: never a half-written file
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
    if (e.isDirectory() && !e.name.startsWith('.') && !(CATEGORIES as readonly string[]).includes(e.name) && e.name !== VISUALS_DIR_NAME) await pruneEmpty(join(root, e.name))
  await writeFile(marker, JSON.stringify({ moved: done.length, at: Date.now(), backup: basename(bk) }))
  return done
}

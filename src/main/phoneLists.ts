import { mkdir, readFile, rename, writeFile } from 'fs/promises'
import { join } from 'path'
import { PHONE_LISTS_FILE } from '../shared/config'
import { parseManifest, recordSent, type ListRef } from '../shared/phoneModel'

/** Add one sent file (and the playlists it is in) to <phoneRoot>/playlists.json. Reads what is there, merges, writes through a temp file so a crash never leaves half a file. */
export async function recordInPhoneLists(phoneRoot: string, rel: string, lists: ListRef[]): Promise<void> {
  const file = join(phoneRoot, PHONE_LISTS_FILE)
  const cur = parseManifest(await readFile(file, 'utf8').catch(() => ''))
  const next = recordSent(cur, rel, lists)
  await mkdir(phoneRoot, { recursive: true })
  const tmp = `${file}.tmp`
  await writeFile(tmp, JSON.stringify(next, null, 2)); await rename(tmp, file)
}

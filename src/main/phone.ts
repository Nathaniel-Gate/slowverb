import { spawn } from 'child_process'
import { mkdir, stat, unlink, writeFile } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { PHONE_DIR_NAME } from '../shared/config'
import { phoneCategory, phoneRel, type ListRef } from '../shared/phoneModel'
import { uniquePath } from './editorPaths'
import { recordInPhoneLists } from './phoneLists'
import { afconvertArgs, phoneDest, tempWavName } from './phoneNames'

const exists = (p: string) => stat(p).then(() => true, () => false)
/** iCloud Drive on this Mac. SLOWVERB_PHONE_DIR overrides it (test runs must never write into the real iCloud folder). */
export const iCloudRoot = () => process.env.SLOWVERB_PHONE_DIR || join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs')
export const phoneRoot = () => process.env.SLOWVERB_PHONE_DIR ? process.env.SLOWVERB_PHONE_DIR : join(iCloudRoot(), PHONE_DIR_NAME)

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args); let err = ''
    p.stderr.on('data', (d) => { err += d }); p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.trim() || `${cmd} exited ${code}`))))
  })
}

/** WAV bytes -> AAC .m4a in the iCloud "Slowverb Phone" folder, inside the song's category folder (Songs / Sound bites / White noise). Never overwrites.
 *  `lists` = the playlists the song is in; they are merged into Slowverb Phone/playlists.json (only those lists, only the files sent). Returns the path. */
export async function sendToPhone(rel: string, title: string, wav: ArrayBuffer, lists: ListRef[] = []): Promise<string> {
  if (!(await exists(iCloudRoot()))) throw new Error('iCloud Drive was not found on this Mac')
  const dest0 = phoneDest(phoneRoot(), rel, title)
  await mkdir(dirname(dest0), { recursive: true })
  const dest = await uniquePath(dirname(dest0), dest0.slice(dirname(dest0).length + 1), exists)
  const tmp = join(tmpdir(), tempWavName(title))
  await writeFile(tmp, Buffer.from(wav))
  try { await run('/usr/bin/afconvert', afconvertArgs(tmp, dest)) } finally { await unlink(tmp).catch(() => {}) }   // our own scratch file
  await recordInPhoneLists(phoneRoot(), phoneRel(phoneCategory(rel), basename(dest)), lists)
  return dest
}

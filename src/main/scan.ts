import { readdir, stat } from 'fs/promises'
import { basename, extname, join } from 'path'
import { parseFile } from 'music-metadata'
import { AUDIO_EXTS, ScanResult } from '../shared/types'

const isAudio = (p: string) => AUDIO_EXTS.includes(extname(p).slice(1).toLowerCase())

async function expand(p: string, out: string[]) {
  const st = await stat(p).catch(() => null)
  if (!st) return
  if (st.isDirectory()) {
    for (const n of (await readdir(p)).sort()) if (!n.startsWith('.')) await expand(join(p, n), out)
  } else if (isAudio(p)) out.push(p)
}

/** Files and folders in -> audio tracks with tags out. Folders are walked recursively. */
export async function scan(paths: string[]): Promise<ScanResult[]> {
  const files: string[] = []
  for (const p of paths) await expand(p, files)
  return Promise.all(files.map(async (path) => {
    const m = await parseFile(path, { duration: true }).catch(() => null)
    return { path, title: m?.common.title || basename(path, extname(path)), artist: m?.common.artist || '', duration: m?.format.duration || 0 }
  }))
}

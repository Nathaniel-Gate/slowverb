import { basename, dirname, extname, join } from 'path'

// Pure path helpers for the editor sidecar files. No electron imports, so they test without it.
export const safeName = (n: string) => n.replace(/[\/:\\]/g, '-').trim().replace(/^\.+/, '')
export const songBase = (song: string) => basename(song, extname(song))
/** `<dirname(song)>/.edits/<songBase>` (dot-folder: the library scan skips it). */
export const editsDir = (song: string) => join(dirname(song), '.edits', songBase(song))
export const versionFile = (song: string, name: string) => {
  const n = safeName(name); if (!n) throw new Error('Empty version name')
  return join(editsDir(song), `${n}.json`)
}
/** First free name: `base.ext`, then `base (1).ext`, `base (2).ext`... `taken` says whether a full path exists. */
export async function uniquePath(dir: string, name: string, taken: (p: string) => Promise<boolean>) {
  let dest = join(dir, name), n = 1
  while (await taken(dest)) dest = join(dir, `${basename(name, extname(name))} (${n++})${extname(name)}`)
  return dest
}
export const renderName = (song: string, versionName: string) => `${safeName(songBase(song))} (${safeName(versionName) || 'Render'}).wav`
export const renamedSongName = (song: string, newBase: string) => `${safeName(newBase)}${extname(song)}`

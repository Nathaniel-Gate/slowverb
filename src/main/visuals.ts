import { app, nativeImage } from 'electron'
import { createHash } from 'crypto'
import { copyFile, mkdir, readdir, rename, stat, writeFile } from 'fs/promises'
import { basename, join, relative, sep } from 'path'
import { IMPORT_MODE, VISUALS_DIR_NAME } from '../shared/config'
import { DEFAULT_GROUPS, defaultGroup, groupOf, mediaKindOf, safeGroup, type VisualItem } from '../shared/visualsModel'
import { libraryRoot } from './paths'
import { uniqueDest } from './playlists'

// The Clips tab's picture library: <library root>/Visuals/<group>/... Plain files, so Finder and the app always agree.
// Thumbnails come from macOS Quick Look (works for pictures AND videos, no ffmpeg) and are cached in userData/thumbs.
export const visualsRoot = () => join(libraryRoot(), VISUALS_DIR_NAME)
const THUMB = { px: 320, quality: 78 }   // longest side of a cached thumbnail, JPEG quality

export async function ensureVisuals() {
  for (const g of DEFAULT_GROUPS) await mkdir(join(visualsRoot(), g), { recursive: true })
  return visualsRoot()
}

/** Every picture and video under Visuals/ (hidden files and folders skipped), newest first. */
export async function listVisuals(): Promise<VisualItem[]> {
  const root = await ensureVisuals(), out: VisualItem[] = []
  const walk = async (dir: string) => {
    for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (e.name.startsWith('.')) continue
      const p = join(dir, e.name)
      if (e.isDirectory()) { await walk(p); continue }
      const kind = mediaKindOf(p); if (!kind) continue
      const st = await stat(p).catch(() => null); if (!st || !st.size) continue
      out.push({ path: p, name: e.name.replace(/\.[^.]+$/, ''), group: groupOf(relative(root, p).split(sep).join('/'), kind), kind, size: st.size, mtimeMs: st.mtimeMs })
    }
  }
  await walk(root)
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** Files or folders dropped onto the Clips tab -> copies (IMPORT_MODE) in Visuals/<group> (default Images or Videos by kind). Never overwrites. */
export async function importVisuals(paths: string[], group?: string): Promise<string[]> {
  const root = await ensureVisuals(), out: string[] = []
  const take = async (p: string) => {
    const st = await stat(p).catch(() => null); if (!st) return
    if (st.isDirectory()) { for (const n of await readdir(p)) if (!n.startsWith('.')) await take(join(p, n)); return }
    const kind = mediaKindOf(p); if (!kind) return
    if (p.startsWith(root + sep)) { out.push(p); return }   // already in the library
    const dest = await uniqueDest(join(root, safeGroup(group || defaultGroup(kind))), basename(p))
    if (IMPORT_MODE === 'move') await rename(p, dest); else await copyFile(p, dest)
    out.push(dest)
  }
  for (const p of paths) await take(p)
  return out
}

/** Cached thumbnail file for a picture or video (null when Quick Look cannot read it: the UI then shows the picture itself). */
export async function thumbFor(path: string): Promise<string | null> {
  const st = await stat(path).catch(() => null); if (!st) return null
  const key = createHash('sha1').update(`${path}|${st.mtimeMs}|${st.size}|${THUMB.px}`).digest('hex')
  const dir = join(app.getPath('userData'), 'thumbs'), file = join(dir, `${key}.jpg`)
  if (await stat(file).then(() => true, () => false)) return file
  try {
    const img = await nativeImage.createThumbnailFromPath(path, { width: THUMB.px, height: THUMB.px })
    if (img.isEmpty()) return null
    await mkdir(dir, { recursive: true }); await writeFile(file, img.toJPEG(THUMB.quality))
    return file
  } catch { return null }
}

/** Save frames the renderer grabbed from a video (filmstrip) next to the thumbnails. Returns the file path. */
export async function saveFrame(key: string, jpeg: ArrayBuffer): Promise<string> {
  const dir = join(app.getPath('userData'), 'thumbs'), file = join(dir, `${createHash('sha1').update(key).digest('hex')}.jpg`)
  await mkdir(dir, { recursive: true }); await writeFile(file, Buffer.from(jpeg))
  return file
}
/** Cached filmstrip frame, if one was saved before. */
export async function frameFor(key: string): Promise<string | null> {
  const file = join(app.getPath('userData'), 'thumbs', `${createHash('sha1').update(key).digest('hex')}.jpg`)
  return (await stat(file).then(() => true, () => false)) ? file : null
}

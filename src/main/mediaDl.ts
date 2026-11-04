import { shell } from 'electron'
import { createWriteStream } from 'fs'
import { basename, extname, join } from 'path'
import { finished } from 'stream/promises'
import { classifyLink, defaultGroup, safeGroup, type MediaKind } from '../shared/visualsModel'
import type { DlProgress } from '../shared/types'
import { downloadVideo } from './ytdlp'
import { forgetBoard, loadState, syncAll, syncLink } from './pinterestCore'
import { pinDeps } from './pinterest'
import { uniqueDest } from './playlists'
import { ensureVisuals } from './visuals'

// "Paste a link or board" in the Clips tab: one entry point that picks the right downloader. One download at a time, cancellable.
export type FetchResult = { paths: string[]; error?: string; note?: string }
type Report = (p: DlProgress) => void
const STALL_MS = 30_000
let active: AbortController | null = null
export const mediaCancel = () => { active?.abort() }

const EXT: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif', 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/webm': '.webm' }
/** Plain-English reason for a direct file link that did not give us a picture or video. Pure. */
export function fileProblem(status: number, type: string): string | null {
  if (status === 401 || status === 403) return `The site refused the download (${status}). It may need a login, or blocks direct links.`
  if (status === 404) return 'Nothing at that link (404). Check it and retry.'
  if (status >= 400) return `The site answered with an error (${status}). Retry in a moment.`
  if (/text\/html/i.test(type)) return 'That link is a web page, not a picture. Right-click the picture and choose Copy Image Address, then paste that.'
  if (!/^(image|video)\//i.test(type)) return `That link is not a picture or video (${type || 'unknown type'}).`
  return null
}

async function fetchFile(url: string, kind: MediaKind, root: string, report: Report, signal: AbortSignal): Promise<string> {
  const ctl = new AbortController(), onAbort = () => ctl.abort(); signal.addEventListener('abort', onAbort)
  let timer = setTimeout(() => ctl.abort(), STALL_MS), dest = ''
  try {
    report({ stage: 'Connecting', pct: null })
    const res = await fetch(url, { signal: ctl.signal, redirect: 'follow' })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase(), bad = fileProblem(res.status, type)
    if (bad) throw new Error(bad)
    const realKind: MediaKind = type.startsWith('video/') ? 'video' : type.startsWith('image/') ? 'image' : kind
    const raw = decodeURIComponent(basename(new URL(res.url || url).pathname)) || 'download', ext = extname(raw) || EXT[type] || (realKind === 'image' ? '.jpg' : '.mp4')
    dest = await uniqueDest(join(root, safeGroup(defaultGroup(realKind))), `${safeGroup(raw.replace(/\.[^.]+$/, '')).replace(/\//g, '-').slice(0, 120)}${ext}`)
    const total = Number(res.headers.get('content-length')) || 0, out = createWriteStream(dest); let got = 0
    const reader = res.body!.getReader()
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      got += value.length; out.write(value)
      clearTimeout(timer); timer = setTimeout(() => ctl.abort(), STALL_MS)
      report({ stage: realKind === 'image' ? 'Downloading picture' : 'Downloading video', pct: total ? (got / total) * 100 : null })
    }
    out.end(); await finished(out)
    return dest
  } catch (e) {
    if (dest) await shell.trashItem(dest).catch(() => undefined)   // half a file is no use: to the Trash (recoverable), never deleted
    throw new Error(signal.aborted ? 'Cancelled' : ctl.signal.aborted ? 'Stopped: the site stopped answering. Retry in a moment.' : e instanceof Error ? e.message : String(e))
  } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
}

/** A pasted link -> files in Visuals/. Pictures/videos by direct link, Pinterest through gallery-dl, any other site through yt-dlp (video). */
export async function mediaFetch(input: string, opts: { privateBoards: boolean }, report: Report): Promise<FetchResult> {
  if (active) return { paths: [], error: 'A download is already running' }
  const link = classifyLink(input, true)
  if (link.kind === 'bad') return { paths: [], error: link.reason }
  active = new AbortController(); const signal = active.signal
  try {
    const root = await ensureVisuals()
    if (link.kind === 'pinterest') return await syncLink(pinDeps(), input, { cookies: opts.privateBoards }, report, signal)
    if (link.kind === 'image' || link.kind === 'video') return { paths: [await fetchFile(link.url, link.kind, root, report, signal)] }
    return { paths: await downloadVideo(link.url, report, join(root, 'Videos'), signal) }
  } catch (e) {
    return { paths: [], error: e instanceof Error ? e.message : String(e) }
  } finally { active = null }
}

export async function pinSyncAll(opts: { privateBoards: boolean }, report: Report): Promise<FetchResult> {
  if (active) return { paths: [], error: 'A download is already running' }
  active = new AbortController()
  try { await ensureVisuals(); return await syncAll(pinDeps(), { cookies: opts.privateBoards }, report, active.signal) }
  catch (e) { return { paths: [], error: e instanceof Error ? e.message : String(e) } } finally { active = null }
}
export const pinState = () => loadState(pinDeps())
export const pinForget = (url: string) => forgetBoard(pinDeps(), url)

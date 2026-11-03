import { app } from 'electron'
import { ChildProcess, spawn } from 'child_process'
import { chmod, mkdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'
import type { DlProgress } from '../shared/types'
import { libraryRoot } from './paths'

// yt-dlp (open source, https://github.com/yt-dlp/yt-dlp) does the actual download. Standalone macOS binary,
// fetched once into app data, self-updates when a site changes things.
const KNOBS = {
  binUrl: 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos',
  stallMs: 45_000,        // no output for this long = stuck: kill it and say so (never an endless bar)
  fetchStallMs: 20_000,   // same for the one-off binary download
  retries: '3', socketTimeout: '15'
}
const bin = () => join(app.getPath('userData'), 'bin', 'yt-dlp')
let targetDir = ''   // set per download: the selected playlist's folder
const downloadDir = () => targetDir

type Report = (p: DlProgress) => void
let current: { child?: ChildProcess; abort: AbortController } | null = null
export const cancelDownload = () => { current?.abort.abort(); current?.child?.kill('SIGTERM') }

async function ensureBinary(report: Report, signal: AbortSignal) {
  if (await stat(bin()).then(() => true, () => false)) return
  await mkdir(join(app.getPath('userData'), 'bin'), { recursive: true })
  report({ stage: 'Getting the downloader (one time)', pct: 0 })
  const ctl = new AbortController(), onAbort = () => ctl.abort(); signal.addEventListener('abort', onAbort)
  let timer = setTimeout(() => ctl.abort(), KNOBS.fetchStallMs)
  try {
    const res = await fetch(KNOBS.binUrl, { signal: ctl.signal })
    if (!res.ok || !res.body) throw new Error(`Could not fetch the downloader (${res.status})`)
    const total = Number(res.headers.get('content-length')) || 0, chunks: Uint8Array[] = []; let got = 0
    const reader = res.body.getReader()
    for (;;) {
      const { done, value } = await reader.read(); if (done) break
      chunks.push(value); got += value.length
      clearTimeout(timer); timer = setTimeout(() => ctl.abort(), KNOBS.fetchStallMs)
      report({ stage: 'Getting the downloader (one time)', pct: total ? (got / total) * 100 : null })
    }
    await writeFile(bin(), Buffer.concat(chunks)); await chmod(bin(), 0o755)
  } catch (e) {
    throw new Error(signal.aborted ? 'Cancelled' : ctl.signal.aborted ? 'Network stalled while getting the downloader' : String(e instanceof Error ? e.message : e))
  } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort) }
}

function run(args: string[], onLine: (l: string) => void, signal: AbortSignal): Promise<{ code: number; err: string; stalled: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(bin(), args); if (current) current.child = child
    let err = '', buf = '', stalled = false
    let timer = setTimeout(stall, KNOBS.stallMs)
    function stall() { stalled = true; child.kill('SIGTERM') }
    const kick = () => { clearTimeout(timer); timer = setTimeout(stall, KNOBS.stallMs) }
    const feed = (d: Buffer) => { kick(); buf += d.toString(); const parts = buf.split(/[\r\n]+/); buf = parts.pop()!; parts.forEach(onLine) }
    child.stdout.on('data', feed); child.stderr.on('data', (d) => { err += d; feed(d) })
    signal.addEventListener('abort', () => child.kill('SIGTERM'))
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 1, err: String(e), stalled }) })
    child.on('close', (code) => { clearTimeout(timer); resolve({ code: code ?? 1, err, stalled }) })
  })
}

/** Audio-only download of exactly ONE item. Any site yt-dlp supports. Plain text = YouTube search, top hit.
 *  A link carrying a playlist/mix/album gets only the item the link points at (first item for a bare playlist link). */
export async function downloadAudio(input: string, report: Report, toRel = ''): Promise<string[]> {
  if (current) throw new Error('A download is already running')
  targetDir = join(libraryRoot(), toRel)
  current = { abort: new AbortController() }
  const signal = current.abort.signal
  try {
    const isUrl = /^[a-z][a-z0-9+.-]*:\/\//i.test(input)
    const url = isUrl ? input : `ytsearch1:${input}`
    await mkdir(downloadDir(), { recursive: true })
    report({ stage: 'Starting', pct: null })
    await ensureBinary(report, signal)
    const attempt = async () => {
      const files: string[] = []; let item: { i: number; n: number } | undefined
      const args = ['--no-mtime', '--ignore-errors', '--retries', KNOBS.retries, '--socket-timeout', KNOBS.socketTimeout,
        '--no-playlist', '--playlist-items', '1',   // ALWAYS just the one thing given: never a mix, album or playlist
        '-f', 'bestaudio[ext=m4a]/bestaudio', '-o', join(downloadDir(), '%(title).150B.%(ext)s'),
        '--newline', '--print', 'after_move:filepath', '--', url]
      const r = await run(args, (l) => {
        const it = l.match(/Downloading item (\d+) of (\d+)/); if (it) item = { i: +it[1], n: +it[2] }
        const m = l.match(/\[download\]\s+([\d.]+)%/)
        if (m) report({ stage: 'Downloading', pct: parseFloat(m[1]), item })
        else if (/^\[(ExtractAudio|Fixup|Metadata)/.test(l)) report({ stage: 'Finishing', pct: 100, item })
        else if (/^\[(youtube|info|generic)/i.test(l)) report({ stage: 'Finding the audio', pct: null, item })
        else if (l.startsWith('/')) files.push(l.trim())
      }, signal)
      return { ...r, files }
    }
    let r = await attempt()
    if (!r.files.length && !signal.aborted && !r.stalled) {   // site changed something: update yt-dlp once, retry
      report({ stage: 'Updating the downloader', pct: null })
      await run(['-U'], () => {}, signal)
      r = await attempt()
    }
    if (signal.aborted) throw new Error('Cancelled')
    if (r.stalled) throw new Error('Stopped: no response for 45 seconds. Check your connection and try again.')
    if (!r.files.length) throw new Error(r.err.split('\n').filter((l) => l.includes('ERROR')).pop()?.replace(/^.*ERROR:\s*/, '') || 'Download failed')
    report({ stage: 'Done', pct: 100 })
    return r.files
  } finally { current = null }
}

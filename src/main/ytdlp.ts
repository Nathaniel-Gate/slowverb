import { app } from 'electron'
import { spawn } from 'child_process'
import { chmod, mkdir, stat, writeFile } from 'fs/promises'
import { join } from 'path'

// yt-dlp (open source, https://github.com/yt-dlp/yt-dlp) does the actual download. Standalone macOS binary,
// fetched once into app data, self-updates when YouTube changes things (it breaks every few weeks).
const BIN_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
const bin = () => join(app.getPath('userData'), 'bin', 'yt-dlp')
export const downloadDir = () => join(app.getPath('music'), 'Slowverb')

async function ensureBinary() {
  if (await stat(bin()).then(() => true, () => false)) return
  await mkdir(join(app.getPath('userData'), 'bin'), { recursive: true })
  const res = await fetch(BIN_URL)
  if (!res.ok) throw new Error(`Could not fetch yt-dlp (${res.status})`)
  await writeFile(bin(), Buffer.from(await res.arrayBuffer())); await chmod(bin(), 0o755)
}

function run(args: string[], onLine: (l: string) => void): Promise<{ code: number; err: string }> {
  return new Promise((resolve) => {
    const p = spawn(bin(), args); let err = '', buf = ''
    const feed = (d: Buffer) => { buf += d.toString(); const parts = buf.split(/[\r\n]+/); buf = parts.pop()!; parts.forEach(onLine) }
    p.stdout.on('data', feed); p.stderr.on('data', (d) => { err += d; feed(d) })
    p.on('error', (e) => resolve({ code: 1, err: String(e) })); p.on('close', (code) => resolve({ code: code ?? 1, err }))
  })
}

/** Audio-only download. Any site yt-dlp supports (YouTube, SoundCloud, Bandcamp, ...). Plain text is treated as a
 *  YouTube search and the top hit is downloaded. Playlist links download every item. Returns saved file paths. */
export async function downloadAudio(input: string, onProgress: (pct: number, stage: string) => void): Promise<string[]> {
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? input : `ytsearch1:${input}`
  await mkdir(downloadDir(), { recursive: true })
  onProgress(0, 'Preparing')
  await ensureBinary()
  const attempt = async () => {
    const files: string[] = []
    const args = ['--no-mtime', '--ignore-errors', '-f', 'bestaudio[ext=m4a]/bestaudio', '-o', join(downloadDir(), '%(title).150B.%(ext)s'),
      '--newline', '--print', 'after_move:filepath', '--', url]
    const r = await run(args, (l) => {
      const m = l.match(/\[download\]\s+([\d.]+)%/)
      if (m) onProgress(parseFloat(m[1]), 'Downloading')
      else if (l.startsWith('/')) files.push(l.trim())
    })
    return { ...r, files }
  }
  let r = await attempt()
  if (!r.files.length) {            // YouTube changed something: update yt-dlp once and retry
    onProgress(0, 'Updating downloader')
    await run(['-U'], () => {})
    r = await attempt()
  }
  if (!r.files.length) throw new Error(r.err.split('\n').filter((l) => l.includes('ERROR')).pop()?.replace(/^.*ERROR:\s*/, '') || 'Download failed')
  onProgress(100, 'Done')
  return r.files
}

import { join } from 'path'
import { classifyLink, parsePinState, upsertBoard, type PinState } from '../shared/visualsModel'
import { galleryArgs, galleryError, galleryFile } from './dlArgs'

// Pinterest sync through gallery-dl (open source, https://github.com/mikf/gallery-dl). There is no macOS standalone binary, so
// it is installed on first use into userData/gallery-dl-venv with the system python3 (python3 -m venv + pip install).
// Everything that touches the OS comes in through Deps, so tests drive it with a mocked runner (no process, no network,
// never Chrome's cookies / the Keychain).
export type Line = (l: string) => void
export type RunResult = { code: number; err: string; stalled: boolean }
export type Deps = {
  userData: string; visuals: string
  run(cmd: string, args: string[], onLine: Line, signal: AbortSignal): Promise<RunResult>
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string | null>; write(path: string, text: string): Promise<void>
  /** A python3 that can run WITHOUT popping the "install developer tools" dialog, or null. */
  python(): Promise<string | null>
}
export type Report = (p: { stage: string; pct: number | null }) => void
export type SyncResult = { paths: string[]; error?: string; note?: string }

const venv = (d: Deps) => join(d.userData, 'gallery-dl-venv')
const gdl = (d: Deps) => join(venv(d), 'bin', 'gallery-dl')
const stateFile = (d: Deps) => join(d.visuals, '.pinterest.json')
const archive = (d: Deps) => join(d.visuals, '.pinterest-archive.sqlite3')

export async function loadState(d: Deps): Promise<PinState> { return parsePinState(await d.read(stateFile(d))) }
async function saveState(d: Deps, s: PinState) { await d.write(stateFile(d), JSON.stringify(s, null, 1)) }

/** Install gallery-dl into its own venv once (or upgrade it with `upgrade`). Throws a plain-English Error when it cannot. */
export async function ensureGalleryDl(d: Deps, report: Report, signal: AbortSignal, upgrade = false): Promise<string> {
  if (!upgrade && await d.exists(gdl(d))) return gdl(d)
  const py = await d.python()
  if (!py) throw new Error('Pinterest needs Python 3, which is not installed. Install the Xcode Command Line Tools (xcode-select --install) and try again.')
  if (!(await d.exists(join(venv(d), 'bin', 'pip')))) {
    report({ stage: 'Setting up the Pinterest downloader (one time)', pct: null })
    const r = await d.run(py, ['-m', 'venv', venv(d)], () => {}, signal)
    if (signal.aborted) throw new Error('Cancelled')
    if (r.code !== 0) throw new Error(`Could not set up the Pinterest downloader: ${r.err.trim().split('\n').pop() || 'python3 -m venv failed'}`)
  }
  report({ stage: upgrade ? 'Updating the Pinterest downloader' : 'Installing the Pinterest downloader (one time)', pct: null })
  const r = await d.run(join(venv(d), 'bin', 'pip'), ['install', '--disable-pip-version-check', '--upgrade', 'gallery-dl'], (l) => {
    if (/^(Collecting|Downloading|Installing)/.test(l)) report({ stage: l.replace(/\s+\(.*$/, '').slice(0, 60), pct: null })
  }, signal)
  if (signal.aborted) throw new Error('Cancelled')
  if (r.code !== 0 || !(await d.exists(gdl(d)))) throw new Error(`Could not install the Pinterest downloader${/network|connection|resolve/i.test(r.err) ? ': no internet connection' : ''}. Retry in a moment.`)
  return gdl(d)
}

/** Sync one Pinterest link (board, section, profile or pin) into Visuals/pinterest/... Only new pins are fetched (archive file). */
export async function syncLink(d: Deps, input: string, o: { cookies: boolean }, report: Report, signal: AbortSignal): Promise<SyncResult> {
  const link = classifyLink(input, true)
  if (link.kind !== 'pinterest') return { paths: [], error: 'That is not a Pinterest link' }
  const exe = await ensureGalleryDl(d, report, signal)
  const go = async (bin: string) => {
    const paths: string[] = []
    report({ stage: `Syncing ${link.label}`, pct: null })
    const r = await d.run(bin, galleryArgs(link.url, { dest: d.visuals, archive: archive(d), cookies: o.cookies }), (l) => {
      const f = galleryFile(l); if (f) { paths.push(f); report({ stage: `Syncing ${link.label}: ${paths.length} new`, pct: null }) }
    }, signal)
    return { ...r, paths }
  }
  let r = await go(exe)
  if (!r.paths.length && r.code !== 0 && !signal.aborted && !r.stalled && !/401|403|404|login|keyring|cookies/i.test(r.err)) {   // site changed something: update once, retry
    r = await go(await ensureGalleryDl(d, report, signal, true))
  }
  if (signal.aborted) return { paths: r.paths, error: 'Cancelled' }
  const error = r.stalled ? 'Stopped: Pinterest did not answer for a while. Retry to carry on where it stopped.' : r.code !== 0 && !r.paths.length ? galleryError(r.err, o.cookies) : undefined
  const prev = (await loadState(d)).boards.find((b) => b.url === link.url)
  if (link.target !== 'pin') {
    await saveState(d, upsertBoard(await loadState(d), { url: link.url, label: link.label, target: link.target, ...(error ? { lastError: error } : { lastSync: Date.now(), lastError: undefined, count: (prev?.count ?? 0) + r.paths.length }) }))
  }
  const note = !error && r.code !== 0 ? 'Some pins could not be fetched (the rest are in).' : undefined
  return { paths: r.paths, error, note }
}

/** Re-sync every saved board, one after another. */
export async function syncAll(d: Deps, o: { cookies: boolean }, report: Report, signal: AbortSignal): Promise<SyncResult> {
  const boards = (await loadState(d)).boards, paths: string[] = [], errors: string[] = []
  if (!boards.length) return { paths, error: 'No boards yet: paste a Pinterest board link first' }
  for (const b of boards) {
    if (signal.aborted) break
    const r = await syncLink(d, b.url, o, report, signal)
    paths.push(...r.paths); if (r.error) errors.push(`${b.label}: ${r.error}`)
  }
  if (signal.aborted) return { paths, error: 'Cancelled' }
  return errors.length === boards.length ? { paths, error: errors[0] } : { paths, note: errors.length ? `${errors.length} board${errors.length > 1 ? 's' : ''} failed. ${errors[0]}` : undefined }
}

export async function forgetBoard(d: Deps, url: string): Promise<PinState> {
  const s = await loadState(d), next = { ...s, boards: s.boards.filter((b) => b.url !== url) }
  await saveState(d, next); return next
}

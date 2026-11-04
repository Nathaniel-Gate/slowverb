import { describe, expect, it, vi } from 'vitest'
import { galleryArgs, galleryError, galleryFile, videoError, ytVideoArgs, VIDEO_FORMAT } from './dlArgs'
import { ensureGalleryDl, forgetBoard, loadState, syncAll, syncLink, type Deps } from './pinterestCore'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' }, shell: { trashItem: async () => undefined }, BrowserWindow: class {} }))

// Every test drives a MOCKED runner: no process starts, nothing touches the network, Chrome's cookies or the Keychain.
type Call = { cmd: string; args: string[] }
function fakeDeps(o: { installed?: boolean; python?: string | null; gallery?: (args: string[], line: (l: string) => void) => { code: number; err?: string } } = {}) {
  const files = new Map<string, string>(), calls: Call[] = [], have = new Set<string>()
  if (o.installed) { have.add('/ud/gallery-dl-venv/bin/gallery-dl'); have.add('/ud/gallery-dl-venv/bin/pip') }
  const d: Deps = {
    userData: '/ud', visuals: '/lib/Visuals',
    async run(cmd, args, onLine) {
      calls.push({ cmd, args })
      if (args[0] === '-m' && args[1] === 'venv') { have.add('/ud/gallery-dl-venv/bin/pip'); return { code: 0, err: '', stalled: false } }
      if (cmd.endsWith('/pip')) { onLine('Collecting gallery-dl'); have.add('/ud/gallery-dl-venv/bin/gallery-dl'); return { code: 0, err: '', stalled: false } }
      const r = o.gallery ? o.gallery(args, onLine) : { code: 0 }
      return { code: r.code, err: r.err ?? '', stalled: false }
    },
    exists: async (p) => have.has(p), python: async () => (o.python === undefined ? '/usr/bin/python3' : o.python),
    read: async (p) => files.get(p) ?? null, write: async (p, t) => { files.set(p, t) }
  }
  return { d, calls, files }
}
const sig = () => new AbortController().signal, quiet = () => {}

describe('downloader command lines', () => {
  it('video mode asks for single-file formats only (no ffmpeg on this Mac), one item, into the folder', () => {
    const a = ytVideoArgs('https://youtu.be/x', '/V/Videos', { retries: '3', socketTimeout: '15' })
    expect(a).toContain('--no-playlist'); expect(a[a.indexOf('-f') + 1]).toBe(VIDEO_FORMAT)
    expect(VIDEO_FORMAT.split('/').every((f) => f.startsWith('b'))).toBe(true)   // never bv+ba (needs a merge)
    expect(a[a.indexOf('-o') + 1].startsWith('/V/Videos/')).toBe(true); expect(a.at(-1)).toBe('https://youtu.be/x')
    expect(videoError('ERROR: [youtube] x: Requested format is not available')).toMatch(/ffmpeg/)
    expect(videoError('ERROR: Sign in to confirm your age')).toMatch(/login/)
  })
  it('gallery-dl: Chrome cookies ONLY when private boards are on; archive makes re-syncs incremental', () => {
    const pub = galleryArgs('https://www.pinterest.com/a/b/', { dest: '/V', archive: '/V/.arc', cookies: false })
    expect(pub).not.toContain('--cookies-from-browser'); expect(pub).toContain('--download-archive'); expect(pub.slice(0, 2)).toEqual(['-d', '/V'])
    const priv = galleryArgs('https://www.pinterest.com/a/b/', { dest: '/V', archive: '/V/.arc', cookies: true })
    expect(priv.slice(priv.indexOf('--cookies-from-browser'), priv.indexOf('--cookies-from-browser') + 2)).toEqual(['--cookies-from-browser', 'chrome'])
    expect(priv.at(-1)).toBe('https://www.pinterest.com/a/b/'); expect(priv.at(-2)).toBe('--')
    expect(galleryFile('/V/pinterest/a/b/1.jpg')).toBe('/V/pinterest/a/b/1.jpg'); expect(galleryFile('# /V/pinterest/a/b/1.jpg')).toBeNull()
  })
  it('turns failures into plain English', () => {
    expect(galleryError('[pinterest][error] HttpError: 401 Unauthorized', false)).toMatch(/PRIVATE BOARDS/)
    expect(galleryError('failed to decrypt cookie (keyring)', true)).toMatch(/Chrome/)
    expect(galleryError('[pinterest][error] 404 Not Found', false)).toMatch(/does not exist/)
    expect(galleryError('getaddrinfo ENOTFOUND', false)).toMatch(/connection/)
  })
})

describe('pinterest sync (mocked runner)', () => {
  it('installs gallery-dl into its own venv on first use, then reuses it', async () => {
    const { d, calls } = fakeDeps()
    expect(await ensureGalleryDl(d, quiet, sig())).toBe('/ud/gallery-dl-venv/bin/gallery-dl')
    expect(calls.map((c) => [c.cmd, ...c.args.slice(0, 2)])).toEqual([['/usr/bin/python3', '-m', 'venv'], ['/ud/gallery-dl-venv/bin/pip', 'install', '--disable-pip-version-check']])
    await ensureGalleryDl(d, quiet, sig()); expect(calls.length).toBe(2)
  })
  it('says so plainly when there is no usable python3 (never pops the developer-tools dialog)', async () => {
    const { d, calls } = fakeDeps({ python: null })
    await expect(ensureGalleryDl(d, quiet, sig())).rejects.toThrow(/Python 3/); expect(calls.length).toBe(0)
  })
  it('syncs a public board without cookies, records it, and a re-sync only adds new pins', async () => {
    let round = 0
    const { d, calls } = fakeDeps({ installed: true, gallery: (_a, line) => { round++; (round === 1 ? ['/lib/Visuals/pinterest/ng/mood/1.jpg', '/lib/Visuals/pinterest/ng/mood/2.jpg'] : ['# /lib/Visuals/pinterest/ng/mood/1.jpg', '/lib/Visuals/pinterest/ng/mood/3.jpg']).forEach(line); return { code: 0 } } })
    const r1 = await syncLink(d, 'https://www.pinterest.com/ng/mood/', { cookies: false }, quiet, sig())
    expect(r1.paths.length).toBe(2); expect(calls[0].args).not.toContain('--cookies-from-browser')
    const r2 = await syncAll(d, { cookies: false }, quiet, sig())
    expect(r2.paths).toEqual(['/lib/Visuals/pinterest/ng/mood/3.jpg'])
    const s = await loadState(d); expect(s.boards).toHaveLength(1); expect(s.boards[0]).toMatchObject({ label: 'ng/mood', count: 3 }); expect(s.boards[0].lastSync).toBeGreaterThan(0)
    expect((await forgetBoard(d, s.boards[0].url)).boards).toEqual([])
  })
  it('private boards switch adds the Chrome cookie flag (command line only: the mock never reads cookies)', async () => {
    const { d, calls } = fakeDeps({ installed: true, gallery: (_a, line) => { line('/lib/Visuals/pinterest/ng/secret/1.jpg'); return { code: 0 } } })
    await syncLink(d, 'ng/secret', { cookies: true }, quiet, sig())
    const g = calls.find((c) => c.cmd.endsWith('gallery-dl'))!
    expect(g.args).toContain('--cookies-from-browser'); expect(g.args.at(-1)).toBe('https://www.pinterest.com/ng/secret/')
  })
  it('a login wall is reported in plain English and saved on the board, without an update loop', async () => {
    const { d, calls } = fakeDeps({ installed: true, gallery: () => ({ code: 1, err: '[pinterest][error] HttpError: 401 Unauthorized' }) })
    const r = await syncLink(d, 'https://www.pinterest.com/ng/hidden/', { cookies: false }, quiet, sig())
    expect(r.error).toMatch(/PRIVATE BOARDS/); expect(calls.filter((c) => c.cmd.endsWith('pip')).length).toBe(0)
    expect((await loadState(d)).boards[0].lastError).toMatch(/private/)
  })
  it('an unknown failure updates gallery-dl once and retries', async () => {
    let n = 0
    const { d, calls } = fakeDeps({ installed: true, gallery: (_a, line) => { n++; if (n === 1) return { code: 1, err: 'KeyError: something changed' }; line('/lib/Visuals/pinterest/a/b/9.jpg'); return { code: 0 } } })
    const r = await syncLink(d, 'https://www.pinterest.com/a/b/', { cookies: false }, quiet, sig())
    expect(r.paths).toHaveLength(1); expect(calls.some((c) => c.cmd.endsWith('pip'))).toBe(true)
  })
  it('refuses links that are not Pinterest', async () => {
    const { d } = fakeDeps({ installed: true })
    expect((await syncLink(d, 'https://example.com/x.jpg', { cookies: false }, quiet, sig())).error).toMatch(/not a Pinterest/)
  })
})

describe('direct file links', () => {
  it('explains login walls, web pages and errors', async () => {
    const { fileProblem } = await import('./mediaDl')
    expect(fileProblem(403, 'text/html')).toMatch(/refused/); expect(fileProblem(200, 'text/html')).toMatch(/Copy Image Address/)
    expect(fileProblem(404, '')).toMatch(/404/); expect(fileProblem(200, 'image/jpeg')).toBeNull(); expect(fileProblem(200, 'application/zip')).toMatch(/not a picture/)
  })
})

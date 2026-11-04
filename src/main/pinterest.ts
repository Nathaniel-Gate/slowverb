import { app } from 'electron'
import { spawn } from 'child_process'
import { mkdir, readFile, rename, stat, writeFile } from 'fs/promises'
import { setPriority } from 'os'
import { dirname } from 'path'
import type { Deps, Line, RunResult } from './pinterestCore'
import { visualsRoot } from './visuals'

// The real OS side of the Pinterest sync (pinterestCore.ts holds the logic). Low priority child processes, killed when stalled.
const STALL_MS = 90_000   // gallery-dl quiet for this long = stuck
const exists = (p: string) => stat(p).then(() => true, () => false)

function run(cmd: string, args: string[], onLine: Line, signal: AbortSignal): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONWARNINGS: 'ignore' } })
    try { if (child.pid) setPriority(child.pid, 10) } catch { /* lower priority is a nicety */ }
    let err = '', buf = '', stalled = false, timer = setTimeout(stall, STALL_MS)
    function stall() { stalled = true; child.kill('SIGTERM') }
    const feed = (d: Buffer) => { clearTimeout(timer); timer = setTimeout(stall, STALL_MS); buf += d.toString(); const parts = buf.split(/[\r\n]+/); buf = parts.pop()!; parts.forEach(onLine) }
    child.stdout.on('data', feed); child.stderr.on('data', (d) => { err += d; feed(d) })
    signal.addEventListener('abort', () => child.kill('SIGTERM'))
    child.on('error', (e) => { clearTimeout(timer); resolve({ code: 1, err: String(e), stalled }) })
    child.on('close', (code) => { clearTimeout(timer); if (buf) onLine(buf); resolve({ code: code ?? 1, err, stalled }) })
  })
}

/** A python3 that will not pop the macOS "install developer tools" dialog: Homebrew's, or Apple's only when the tools exist. */
async function python(): Promise<string | null> {
  for (const p of ['/opt/homebrew/bin/python3', '/usr/local/bin/python3']) if (await exists(p)) return p
  if (!(await exists('/usr/bin/python3'))) return null
  const tools = await new Promise<boolean>((ok) => { const c = spawn('/usr/bin/xcode-select', ['-p']); c.on('close', (code) => ok(code === 0)); c.on('error', () => ok(false)) })
  return tools ? '/usr/bin/python3' : null
}

export const pinDeps = (): Deps => ({
  userData: app.getPath('userData'), visuals: visualsRoot(), run, exists, python,
  read: (p) => readFile(p, 'utf8').catch(() => null),
  async write(p, text) { await mkdir(dirname(p), { recursive: true }); const tmp = `${p}.${process.pid}.${Date.now()}.tmp`; await writeFile(tmp, text); await rename(tmp, p) }
})

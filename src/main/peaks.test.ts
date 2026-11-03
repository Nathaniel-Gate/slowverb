import { mkdtempSync, readdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, shell: {}, BrowserWindow: class {} }))
const root = mkdtempSync(join(tmpdir(), 'sv-peaks-'))
process.env.SLOWVERB_ROOT = root
const { peaksGet, peaksPut, peaksStat } = await import('./editor')

describe('peaks cache IPC handlers', () => {
  it('put then get returns identical bytes; unknown key is null; writes under SLOWVERB_ROOT/.peaks', async () => {
    const data = new Float32Array([1, -2, 3.5]).buffer
    expect(await peaksGet('abc-1-2-v1')).toBeNull()
    await peaksPut('abc-1-2-v1', data)
    const back = await peaksGet('abc-1-2-v1')
    expect(Array.from(new Float32Array(back!))).toEqual([1, -2, 3.5])
    expect(readdirSync(join(root, '.peaks'))).toEqual(['abc-1-2-v1.pks'])
  })
  it('keys with path separators or dots cannot escape the cache folder', async () => {
    await peaksPut('../../evil', new ArrayBuffer(4))
    expect(readdirSync(join(root, '.peaks')).every((f) => !f.includes('/'))).toBe(true)
    expect(readdirSync(root).filter((f) => f !== '.peaks')).toEqual([])
  })
  it('peaksStat gives mtime and size, null for a missing file', async () => {
    const f = join(root, 'x.bin'); writeFileSync(f, 'hello')
    const s = await peaksStat(f)
    expect(s?.size).toBe(5); expect(s!.mtimeMs).toBeGreaterThan(0); expect(await peaksStat(join(root, 'nope'))).toBeNull()
  })
})

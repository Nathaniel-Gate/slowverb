import { mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, shell: {}, BrowserWindow: class {} }))

describe('playlists file safety', () => {
  it('never lets an empty list replace real playlists unless the user cleared them', async () => {
    process.env.SLOWVERB_ROOT = mkdtempSync(join(tmpdir(), 'svlists-'))
    const { writeLists, readLists } = await import('./library')
    const pl = { id: 'a', name: 'Rap', created: 1, songs: ['Songs/x.m4a'] }
    await writeLists([pl]); await writeLists([])
    expect(await readLists()).toEqual([pl])          // accidental empty save refused
    await writeLists([], true)
    expect(await readLists()).toEqual([])            // deliberate clear honoured
    const dir = join(process.env.SLOWVERB_ROOT, '.slowverb')
    expect(JSON.parse(readFileSync(join(dir, 'playlists.json'), 'utf8')).playlists).toEqual([])
  })
})

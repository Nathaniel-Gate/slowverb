import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { editsDir, relocateVersion, renamedSongName, renderName, safeName, uniquePath, versionFile } from './editorPaths'

vi.mock('electron', () => ({ app: { getPath: () => tmpdir() }, shell: {}, BrowserWindow: class {} }))

describe('editor paths', () => {
  it('sanitises names', () => {
    expect(safeName('../a/b:c\\d')).toBe('-a-b-c-d')
    expect(safeName('.hidden')).toBe('hidden')
  })
  it('builds sidecar paths', () => {
    expect(editsDir('/m/Pl/Song One.mp3')).toBe('/m/Pl/.edits/Song One')
    expect(versionFile('/m/Pl/x.mp3', 'Ext/ended')).toBe('/m/Pl/.edits/x/Ext-ended.json')
    expect(() => versionFile('/m/x.mp3', '..')).toThrow()
  })
  it('names renders and renames', () => {
    expect(renderName('/m/a.mp3', 'Extended')).toBe('a (Extended).wav')
    expect(renamedSongName('/m/a.flac', 'b/c')).toBe('b-c.flac')
  })
  it('picks unique paths', async () => {
    const taken = new Set(['/d/a.wav', '/d/a (1).wav'])
    expect(await uniquePath('/d', 'a.wav', async (p) => taken.has(p))).toBe('/d/a (2).wav')
  })
})

describe('library scan', () => {
  it('ignores .edits', async () => {
    const root = mkdtempSync(join(tmpdir(), 'svroot-'))
    process.env.SLOWVERB_ROOT = root
    mkdirSync(join(root, 'Pl', '.edits', 'x'), { recursive: true })
    writeFileSync(join(root, 'Pl', 'x.mp3'), ''); writeFileSync(join(root, 'Pl', '.edits', 'x', 'v.mp3'), '')
    const { sync } = await import('./playlists')
    const r = await sync()
    expect(r.files).toEqual([join(root, 'Pl', 'x.mp3')])
    expect(r.folders).toEqual(['Pl', 'Songs', 'Sound bites'])   // the two category homes always exist
  })
})

describe('relocateVersion', () => {
  it('repoints the song and its bounces after the song moved', () => {
    const old = '/L/Helium.m4a', now = '/L/Songs/Helium.m4a'
    const text = JSON.stringify({ song: old, sources: { [old]: { duration: 1 }, '/L/.edits/Helium/bounces/B 1.wav': { duration: 2 } }, clips: [{ src: '/L/.edits/Helium/bounces/B 1.wav' }] })
    const p = JSON.parse(relocateVersion(text, now))
    expect(p.song).toBe(now); expect(Object.keys(p.sources)).toEqual([now, '/L/Songs/.edits/Helium/bounces/B 1.wav']); expect(p.clips[0].src).toBe('/L/Songs/.edits/Helium/bounces/B 1.wav')
  })
  it('leaves an up-to-date version untouched', () => { const t = JSON.stringify({ song: '/L/a.m4a' }); expect(relocateVersion(t, '/L/a.m4a')).toBe(t) })
})

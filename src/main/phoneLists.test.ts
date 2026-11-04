import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { recordInPhoneLists } from './phoneLists'

describe('phone playlists file', () => {
  it('creates, then merges, <phone folder>/playlists.json', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'slowverb-phone-test-'))
    const lst = { id: 'g1', name: 'Gym', created: 1, category: 'Songs' }
    await recordInPhoneLists(dir, 'Songs/a.m4a', [lst])
    await recordInPhoneLists(dir, 'Songs/b.m4a', [lst])
    await recordInPhoneLists(dir, 'White noise/r.m4a', [])
    const m = JSON.parse(await readFile(join(dir, 'playlists.json'), 'utf8'))
    expect(m.version).toBe(1); expect(m.files).toEqual(['Songs/a.m4a', 'Songs/b.m4a', 'White noise/r.m4a'])
    expect(m.playlists).toEqual([{ id: 'g1', name: 'Gym', created: 1, category: 'Songs', songs: ['Songs/a.m4a', 'Songs/b.m4a'] }])
  })
  it('survives a damaged existing file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'slowverb-phone-test-'))
    await writeFile(join(dir, 'playlists.json'), '{{{')
    await recordInPhoneLists(dir, 'Songs/a.m4a', [])
    expect(JSON.parse(await readFile(join(dir, 'playlists.json'), 'utf8')).files).toEqual(['Songs/a.m4a'])
  })
})

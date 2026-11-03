import { beforeEach, describe, expect, it, vi } from 'vitest'

const files = vi.hoisted(() => new Map<string, string>())
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Documents: 'DOCUMENTS' }, Encoding: { UTF8: 'utf8' },
  Filesystem: {
    async readFile({ path }: { path: string }) { if (!files.has(path)) throw new Error('nope'); return { data: files.get(path)! } },
    async writeFile({ path, data }: { path: string; data: string }) { files.set(path, data); return { uri: path } },
    async appendFile({ path, data }: { path: string; data: string }) { files.set(path, (files.get(path) ?? '') + data) },
    async deleteFile({ path }: { path: string }) { files.delete(path) },
    async getUri({ path }: { path: string }) { return { uri: `file:///Documents/${path}` } }
  }
}))
import { createNativePlatform } from './native'

const meta = { title: 'T', artist: '', duration: 5, size: 6, addedAt: 1 }
beforeEach(() => files.clear())

describe('native platform (Capacitor Filesystem)', () => {
  it('writes the file under songs/, keeps metadata json, and survives a restart', async () => {
    const p = createNativePlatform()
    const s = await p.putSong(meta, new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])], { type: 'audio/mp4' }))
    expect(files.get(`songs/${s.id}.m4a`)).toBe(btoa('\x01\x02\x03\x04\x05\x06'))
    expect(await createNativePlatform().listSongs()).toEqual([s]) // fresh instance reads library.json
    expect(Object.keys(await createNativePlatform().listSongs().then((l) => l[0]))).not.toContain('ext')
  })
  it('url goes through convertFileSrc', async () => {
    const p = createNativePlatform()
    const s = await p.putSong(meta, new Blob(['x'], { type: 'audio/mpeg' }))
    expect(await p.getSongUrl(s.id)).toContain(`songs/${s.id}.mp3`)
  })
  it('update and delete', async () => {
    const p = createNativePlatform()
    const s = await p.putSong(meta, new Blob(['x'], { type: 'audio/mpeg' }))
    await p.updateSong(s.id, { title: 'New' })
    expect((await createNativePlatform().listSongs())[0].title).toBe('New')
    await p.deleteSong(s.id)
    expect(files.has(`songs/${s.id}.mp3`)).toBe(false)
    expect(await createNativePlatform().listSongs()).toEqual([])
  })
})

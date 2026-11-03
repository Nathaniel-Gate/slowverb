import type { Platform, PickedFile, Song } from './types'

/** In-memory Platform for tests and dev seeding. `queue` is what the next pickAudioFiles() call returns. */
export function memoryPlatform(queue: PickedFile[] = []): Platform & { queue: PickedFile[]; blobs: Map<string, Blob> } {
  const songs = new Map<string, Song>(), blobs = new Map<string, Blob>()
  let n = 0
  return {
    queue, blobs,
    async pickAudioFiles() { const q = this.queue; this.queue = []; return q },
    async putSong(meta, data) { const s: Song = { ...meta, id: `s${++n}` }; songs.set(s.id, s); blobs.set(s.id, data); return s },
    async listSongs() { return [...songs.values()] },
    async getSongUrl(id) { if (!songs.has(id)) throw new Error('missing'); return `mem://${id}` },
    async deleteSong(id) { songs.delete(id); blobs.delete(id) },
    async updateSong(id, patch) { const s = songs.get(id); if (s) songs.set(id, { ...s, ...patch }) }
  }
}
export const fakeFile = (name: string, bytes = 8): PickedFile => ({ name, blob: new Blob([new Uint8Array(bytes)], { type: 'audio/mpeg' }) })

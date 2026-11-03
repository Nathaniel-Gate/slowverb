import type { Fx } from '@shared/types'

export type Song = { id: string; title: string; artist: string; duration: number; size: number; addedAt: number; fx?: Fx }
export type PickedFile = { name: string; blob: Blob }

export interface Platform {
  pickAudioFiles(): Promise<PickedFile[]>
  putSong(meta: Omit<Song, 'id'>, data: Blob): Promise<Song>
  listSongs(): Promise<Song[]>
  /** A URL the <audio> element can play: blob: on web, Capacitor.convertFileSrc on native. */
  getSongUrl(id: string): Promise<string>
  deleteSong(id: string): Promise<void>
  updateSong(id: string, patch: Partial<Pick<Song, 'title' | 'artist' | 'fx'>>): Promise<void>
}

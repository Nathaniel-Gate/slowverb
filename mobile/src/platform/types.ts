import type { Fx, Playlist } from '@shared/types'

/** category = the song's one home (Songs / Sound bites / White noise; unset = Songs). file = its file name as imported, which with the category gives its
 *  path 'Songs/a.m4a' (the same shape as on the Mac, so playlists from the Mac line up). */
export type Song = { id: string; title: string; artist: string; duration: number; size: number; addedAt: number; fx?: Fx; category?: string; file?: string }
export type PickedFile = { name: string; blob: Blob }

export interface Platform {
  pickAudioFiles(): Promise<PickedFile[]>
  putSong(meta: Omit<Song, 'id'>, data: Blob): Promise<Song>
  listSongs(): Promise<Song[]>
  /** A URL the <audio> element can play: blob: on web, Capacitor.convertFileSrc on native. */
  getSongUrl(id: string): Promise<string>
  deleteSong(id: string): Promise<void>
  updateSong(id: string, patch: Partial<Pick<Song, 'title' | 'artist' | 'fx' | 'category' | 'file'>>): Promise<void>
  /** Playlists (virtual: lists of song paths). Stored next to the songs. */
  loadLists(): Promise<Playlist[]>
  saveLists(lists: Playlist[]): Promise<void>
}

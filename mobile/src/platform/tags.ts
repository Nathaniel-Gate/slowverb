import { CONFIG } from '../config'
import type { PickedFile } from './types'

export type Tags = { title: string; artist: string; duration: number }

/** "Artist - Title.mp3" -> { artist, title }; anything else -> title only. (No tag library: it did not justify its bundle size on a phone.) */
export function tagsFromName(name: string): Omit<Tags, 'duration'> {
  const base = name.replace(/\.[A-Za-z0-9]{2,5}$/, '').replace(/_/g, ' ').trim()
  const i = base.indexOf(' - ')
  if (i > 0 && i < base.length - 3) return { artist: base.slice(0, i).trim(), title: base.slice(i + 3).trim() }
  return { artist: '', title: base || 'Untitled' }
}

/** Duration in seconds via a throwaway <audio> element; 0 when it cannot be read (or there is no DOM). */
export function readDuration(blob: Blob): Promise<number> {
  if (typeof Audio === 'undefined' || typeof URL.createObjectURL !== 'function') return Promise.resolve(0)
  return new Promise((resolve) => {
    const a = new Audio(), url = URL.createObjectURL(blob)
    const end = (d: number) => { clearTimeout(t); a.removeAttribute('src'); URL.revokeObjectURL(url); resolve(Number.isFinite(d) && d > 0 ? d : 0) }
    const t = setTimeout(() => end(0), CONFIG.tagTimeoutMs)
    a.preload = 'metadata'
    a.onloadedmetadata = () => end(a.duration)
    a.onerror = () => end(0)
    a.src = url
  })
}

export async function readTags(f: PickedFile): Promise<Tags> {
  return { ...tagsFromName(f.name), duration: await readDuration(f.blob) }
}

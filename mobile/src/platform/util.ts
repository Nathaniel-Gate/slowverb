import { CONFIG } from '../config'
import type { PickedFile } from './types'

export const newId = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const EXT_BY_MIME: Record<string, string> = {
  'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/flac': 'flac', 'audio/x-flac': 'flac',
  'audio/ogg': 'ogg', 'audio/opus': 'opus', 'audio/aiff': 'aiff', 'audio/x-aiff': 'aiff', 'audio/x-caf': 'caf'
}
export const MIME_BY_EXT: Record<string, string> = Object.fromEntries(Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m]))
export const extFor = (blob: Blob): string => EXT_BY_MIME[blob.type] ?? 'm4a'

/** Opens the system file picker (Files app incl. iCloud Drive on iOS). Must be called straight from a tap handler. */
export function pickViaInput(): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'; input.multiple = true; input.accept = CONFIG.audioAccept
    input.style.display = 'none'
    document.body.appendChild(input)
    let done = false
    const finish = (files: PickedFile[]) => { if (done) return; done = true; input.remove(); resolve(files) }
    input.addEventListener('change', () => finish(Array.from(input.files ?? []).map((f) => ({ name: f.name, blob: f }))))
    input.addEventListener('cancel', () => finish([]))
    input.click()
  })
}

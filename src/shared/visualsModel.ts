import { VISUALS_DIR_NAME } from './config'

// Pure rules for the Clips tab's picture library (<library root>/Visuals/<group>/...). No electron / DOM imports.

export const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'heic', 'avif']
export const VIDEO_EXTS = ['mp4', 'm4v', 'mov', 'webm']
export type MediaKind = 'image' | 'video'
/** One file in Visuals/. group = folder path under Visuals ('Images', 'Videos', 'Pinterest/ng/moodboard'). */
export type VisualItem = { path: string; name: string; group: string; kind: MediaKind; size: number; mtimeMs: number }

const ext = (p: string) => { const s = p.slice(p.lastIndexOf('/') + 1), i = s.lastIndexOf('.'); return i > 0 ? s.slice(i + 1).toLowerCase() : '' }
export const mediaKindOf = (path: string): MediaKind | null => IMAGE_EXTS.includes(ext(path)) ? 'image' : VIDEO_EXTS.includes(ext(path)) ? 'video' : null
/** Default folder for an import of this kind. */
export const defaultGroup = (kind: MediaKind) => (kind === 'image' ? 'Images' : 'Videos')
export const DEFAULT_GROUPS = ['Images', 'Videos'] as const
/** Is a path (relative to the library root) inside the Visuals home? The audio library never lists these. */
export const inVisuals = (rel: string) => rel === VISUALS_DIR_NAME || rel.startsWith(VISUALS_DIR_NAME + '/')
/** Group of a file from its path relative to Visuals/ ('Pinterest/ng/board/123.jpg' -> 'Pinterest/ng/board'; loose files -> 'Images'/'Videos'). */
export function groupOf(relInVisuals: string, kind: MediaKind): string {
  const i = relInVisuals.lastIndexOf('/')
  return i > 0 ? relInVisuals.slice(0, i) : defaultGroup(kind)
}
/** Folder names for a group typed by the user: no path tricks, never hidden. */
export const safeGroup = (g: string) => g.split('/').map((s) => s.replace(/[:\\]/g, '-').trim().replace(/^\.+/, '')).filter(Boolean).join('/') || 'Images'

/** What a pasted link is, so the Clips tab knows which downloader to use. */
export type LinkKind =
  | { kind: 'pinterest'; target: 'pin' | 'board' | 'user' | 'section'; url: string; label: string }
  | { kind: 'image' | 'video'; url: string }      // a direct file link: plain fetch
  | { kind: 'site'; url: string }                 // anything else: yt-dlp video mode
  | { kind: 'bad'; reason: string }

const PIN_HOST = /^(?:[a-z]{2,3}\.)?pinterest\.[a-z.]+$|^pin\.it$/i
/** Classify a pasted link. Accepts full URLs, pinterest.com/user/board paths, and the short form "user/board" when `pinterestShort` is set. */
export function classifyLink(input: string, pinterestShort = false): LinkKind {
  const raw = input.trim()
  if (!raw) return { kind: 'bad', reason: 'Paste a link first' }
  if (pinterestShort && /^@?[\w.-]+(\/[\w%.-]+){0,2}\/?$/.test(raw) && !raw.includes('.com')) {
    const parts = raw.replace(/^@/, '').replace(/\/$/, '').split('/')
    return pinterestOf(`https://www.pinterest.com/${parts.join('/')}/`, parts)
  }
  let u: URL
  try { u = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`) } catch { return { kind: 'bad', reason: 'That is not a link' } }
  if (!/^https?:$/.test(u.protocol)) return { kind: 'bad', reason: 'Only web links (http or https) work here' }
  if (PIN_HOST.test(u.hostname)) {
    if (u.hostname.toLowerCase() === 'pin.it') return { kind: 'pinterest', target: 'pin', url: u.href, label: 'Pin' }
    const parts = u.pathname.split('/').filter(Boolean).map(decodeURIComponent)
    return pinterestOf(u.href, parts)
  }
  const e = ext(u.pathname)
  if (IMAGE_EXTS.includes(e)) return { kind: 'image', url: u.href }
  if (VIDEO_EXTS.includes(e)) return { kind: 'video', url: u.href }
  return { kind: 'site', url: u.href }
}
function pinterestOf(url: string, parts: string[]): LinkKind {
  if (parts[0] === 'pin' && parts[1]) return { kind: 'pinterest', target: 'pin', url, label: `Pin ${parts[1]}` }
  if (!parts.length) return { kind: 'bad', reason: 'Paste a board link, a profile link or a pin link' }
  if (parts.length === 1) return { kind: 'pinterest', target: 'user', url, label: `${parts[0]} (all boards)` }
  if (parts.length === 2) return { kind: 'pinterest', target: 'board', url, label: `${parts[0]}/${parts[1]}` }
  return { kind: 'pinterest', target: 'section', url, label: parts.slice(0, 3).join('/') }
}
/** Folder (under Visuals/) gallery-dl saves a Pinterest link into: its own default layout pinterest/<user>/<board>. */
export const PINTEREST_DIR = 'pinterest'
export function pinterestGroup(l: Extract<LinkKind, { kind: 'pinterest' }>): string {
  return l.target === 'pin' ? PINTEREST_DIR : `${PINTEREST_DIR}/${l.label.replace(/ \(all boards\)$/, '').split('/').map((s) => safeGroup(s)).join('/')}`
}

/** Saved list of Pinterest boards (Visuals/.pinterest.json). */
export type PinBoard = { url: string; label: string; target: string; lastSync: number | null; count: number; lastError?: string }
export type PinState = { version: 1; boards: PinBoard[] }
export const emptyPinState = (): PinState => ({ version: 1, boards: [] })
/** Add or update a board by URL (stable order: new boards at the end). */
export function upsertBoard(s: PinState, b: Partial<PinBoard> & { url: string }): PinState {
  const i = s.boards.findIndex((x) => x.url === b.url)
  if (i < 0) return { ...s, boards: [...s.boards, { label: b.url, target: 'board', lastSync: null, count: 0, ...b }] }
  return { ...s, boards: s.boards.map((x, j) => (j === i ? { ...x, ...b } : x)) }
}
export function parsePinState(text: string | null): PinState {
  try {
    const j = JSON.parse(text ?? '')
    if (j && j.version === 1 && Array.isArray(j.boards)) return { version: 1, boards: j.boards.filter((b: PinBoard) => b && typeof b.url === 'string') }
  } catch { /* fall through */ }
  return emptyPinState()
}

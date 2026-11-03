/** Lock screen / Control Center wiring (navigator.mediaSession). Every call is a safe no-op where unsupported. */
export type SessionHandlers = {
  play(): void; pause(): void; seekto(t: number): void; nexttrack(): void; previoustrack(): void
}
const ms = (): MediaSession | null => (typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null)

export function bindSession(h: SessionHandlers) {
  const s = ms(); if (!s) return
  const set = (a: MediaSessionAction, fn: MediaSessionActionHandler) => { try { s.setActionHandler(a, fn) } catch { /* unsupported action */ } }
  set('play', () => h.play())
  set('pause', () => h.pause())
  set('seekto', (d) => { if (typeof d.seekTime === 'number') h.seekto(d.seekTime) })
  set('nexttrack', () => h.nexttrack())
  set('previoustrack', () => h.previoustrack())
}

export function setNowPlaying(m: { title: string; artist: string }) {
  const s = ms(); if (!s) return
  try { s.metadata = new MediaMetadata({ title: m.title, artist: m.artist, album: 'Slowverb' }) } catch { /* no MediaMetadata */ }
}

export function setPlaybackState(state: MediaSessionPlaybackState) {
  const s = ms(); if (s) s.playbackState = state
}

export function setPosition(position: number, duration: number, playbackRate: number) {
  const s = ms()
  if (!s?.setPositionState || !Number.isFinite(duration) || duration <= 0) return
  try { s.setPositionState({ duration, playbackRate: playbackRate || 1, position: Math.min(Math.max(position, 0), duration) }) } catch { /* bad values */ }
}

export function clearSession() {
  const s = ms(); if (!s) return
  s.playbackState = 'none'
  try { s.metadata = null } catch { /* ignore */ }
}

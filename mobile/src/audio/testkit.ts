import { vi } from 'vitest'

class FakeNode {
  gain = { value: 1 }; frequency = { value: 0 }; type = ''; buffer: unknown = null
  connect<T>(n: T): T { return n }
  copyToChannel() { /* ignore */ }
}
export class FakeAudioContext extends EventTarget {
  state = 'suspended'; sampleRate = 44100; destination = new FakeNode(); resumes = 0
  constructor(public opts?: unknown) { super() }
  async resume() { this.resumes++; this.state = 'running' }
  createMediaElementSource() { return new FakeNode() }
  createGain() { return new FakeNode() }
  createConvolver() { return new FakeNode() }
  createBiquadFilter() { return new FakeNode() }
  createBuffer() { return new FakeNode() }
}
export class FakeAudio extends EventTarget {
  paused = true; ended = false; currentTime = 0; duration = NaN; playbackRate = 1; preservesPitch = true
  private attrs = new Map<string, string>()
  
  get src() { return this.attrs.get('src') ?? '' }
  set src(v: string) { this.attrs.set('src', v); queueMicrotask(() => this.fire('loadedmetadata')) }
  setAttribute(k: string, v: string) { this.attrs.set(k, v) }
  getAttribute(k: string) { return this.attrs.get(k) ?? null }
  removeAttribute(k: string) { this.attrs.delete(k) }
  load() { /* noop */ }
  async play() { this.paused = false; this.ended = false; this.fire('play') }
  pause() { if (!this.paused) { this.paused = true; this.fire('pause') } }
  onloadedmetadata: (() => void) | null = null; onerror: (() => void) | null = null
  fire(type: string) { this.dispatchEvent(new Event(type)); if (type === 'loadedmetadata') this.onloadedmetadata?.(); if (type === 'error') this.onerror?.() }
  finish() { this.paused = true; this.ended = true; this.fire('pause'); this.fire('ended') }
}

export type FakeSession = { metadata: unknown; playbackState: string; handlers: Record<string, (d?: unknown) => void>; position: unknown; setActionHandler(a: string, h: (d?: unknown) => void): void; setPositionState(s: unknown): void }
export function fakeSession(): FakeSession {
  const s: FakeSession = {
    metadata: null, playbackState: 'none', handlers: {}, position: null,
    setActionHandler(a, h) { s.handlers[a] = h },
    setPositionState(p) { s.position = p }
  }
  return s
}

/** Installs Audio, AudioContext, MediaMetadata, mediaSession and localStorage globals. Returns the fake session. */
export function installBrowserFakes() {
  const store = new Map<string, string>()
  const session = fakeSession()
  vi.stubGlobal('Audio', FakeAudio)
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('MediaMetadata', class { constructor(public init: unknown) { Object.assign(this, init) } })
  vi.stubGlobal('navigator', { mediaSession: session })
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k)
  })
  return { session, store }
}

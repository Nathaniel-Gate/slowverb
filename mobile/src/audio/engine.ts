import type { Fx } from '@shared/types'
import { buildChain } from '@app/audio/chain'
import { clearSession, setNowPlaying, setPlaybackState, setPosition, bindSession, type SessionHandlers } from './mediaSession'

/** The one live audio engine for the phone: one <audio> element -> the same slowed + reverb chain as the Mac app.
 *  Created lazily (first use), so importing this file never touches Web Audio. No React in here. */
class Engine {
  private _el: HTMLAudioElement | null = null
  private _ctx: AudioContext | null = null
  private chain: ReturnType<typeof buildChain> | null = null
  private url: string | null = null
  private lastFx: Fx | null = null

  private init() {
    if (this._el) return
    // iOS: 'playback' keeps audio going with the silent switch on and the screen locked (iOS 17+ API, ignored elsewhere).
    try {
      const as = (navigator as unknown as { audioSession?: { type: string } }).audioSession
      if (as) as.type = 'playback'
    } catch { /* unsupported */ }
    const el = new Audio(), ctx = new AudioContext({ latencyHint: 'playback' })
    el.crossOrigin = 'anonymous'; el.preload = 'auto'; el.setAttribute('playsinline', '')
    this._el = el; this._ctx = ctx
    this.chain = buildChain(ctx, ctx.createMediaElementSource(el))
    // Calls / Siri / alarms leave the context 'interrupted' (iOS) or 'suspended': pick it back up when we are meant to be playing.
    ctx.addEventListener('statechange', () => { if (!el.paused && ctx.state !== 'running') void ctx.resume().catch(() => undefined) })
    el.addEventListener('play', () => { setPlaybackState('playing'); void ctx.resume().catch(() => undefined) })
    el.addEventListener('pause', () => setPlaybackState(this.url ? 'paused' : 'none'))
    for (const e of ['timeupdate', 'durationchange', 'ratechange', 'seeked'] as const) el.addEventListener(e, () => this.syncPosition())
  }
  private syncPosition() { const el = this._el!; setPosition(el.currentTime, el.duration, el.playbackRate) }

  get el(): HTMLAudioElement { this.init(); return this._el! }
  get ctx(): AudioContext { this.init(); return this._ctx! }
  /** True once something is loaded and not cleared. */
  get loaded() { return this.url !== null }
  /** True once the element/context exist (so callers can avoid creating them just to subscribe). */
  get ready() { return this._el !== null }

  /** Call synchronously inside a tap handler: iOS only lets the AudioContext start from a user gesture. */
  unlock() { void this.ctx.resume().catch(() => undefined) }

  apply(fx: Fx) {
    this.init(); this.lastFx = fx
    const el = this._el as HTMLAudioElement & { webkitPreservesPitch?: boolean }
    el.preservesPitch = fx.pitchLock; el.webkitPreservesPitch = fx.pitchLock
    el.playbackRate = fx.speed
    this.chain!.apply(fx)
  }

  /** Load a URL with a version applied. `startAt` (seconds) seeks once the metadata is known, before playing. */
  async load(url: string, fx: Fx, autoplay = true, startAt = 0) {
    this.unlock()
    const el = this.el
    this.url = url
    el.src = url
    this.apply(fx)
    if (startAt > 0) {
      await new Promise<void>((res) => {
        const done = () => { el.removeEventListener('loadedmetadata', done); clearTimeout(t); res() }
        const t = setTimeout(done, 5000)
        el.addEventListener('loadedmetadata', done)
      })
      try { el.currentTime = startAt } catch { /* not seekable yet */ }
    }
    await this.ctx.resume().catch(() => undefined)
    if (autoplay) await el.play()
  }

  /** Lock-screen buttons -> app actions. */
  bindSession(h: SessionHandlers) { bindSession(h) }
  setNowPlaying(m: { title: string; artist: string }) { setNowPlaying(m) }

  clear() {
    if (!this._el) return
    this._el.pause(); this._el.removeAttribute('src'); this._el.load?.()
    this.url = null
    clearSession()
  }
  /** The version currently applied (for debugging / tests). */
  get applied() { return this.lastFx }
}
export const engine = new Engine()

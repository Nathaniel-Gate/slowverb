import type { Fx } from '../../../shared/types'
import { buildChain } from './chain'

/** The one live audio engine: an <audio> element feeding the effect chain. No React in here. */
class Engine {
  readonly el = new Audio()
  readonly ctx = new AudioContext()
  private chain
  constructor() {
    this.el.crossOrigin = 'anonymous'
    this.chain = buildChain(this.ctx, this.ctx.createMediaElementSource(this.el))
  }
  get out() { return this.chain.out }
  apply(fx: Fx) {
    this.el.preservesPitch = fx.pitchLock
    this.el.playbackRate = fx.speed
    this.chain.apply(fx)
  }
  async load(path: string, fx: Fx, autoplay = true) {
    await this.ctx.resume()
    this.el.src = 'media://local' + encodeURI(path)
    this.apply(fx)
    if (autoplay) await this.el.play()
  }
  get loaded() { return !!this.el.getAttribute('src') }
  clear() { this.el.pause(); this.el.removeAttribute('src') }
}
export const engine = new Engine()

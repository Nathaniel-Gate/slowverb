import { mediaUrl } from '../../../shared/mediaUrl'
import { AMBIENCE, clampMasterDb, clampSoundDb, dbToGain, loopChannels } from './ambience'

/** urls = the tracks this layer plays in order. One url + loop = a seamless loop; otherwise they play through (and start over at the end when loop is on). */
export type AmbienceLayer = { key: string; urls: string[]; db: number; loop: boolean }   // key = rel path, url = absolute file path, db = this sound's own level
type Voice = { src: AudioBufferSourceNode | null; gain: GainNode; sig: string; dead: boolean }

/** The ambience layer's own audio output: each chosen Sound bite loops on its own voice -> voice gain -> fade -> master level -> speakers.
 *  Its OWN AudioContext, created on the first play() and suspended whenever it is faded out, so it costs nothing while off
 *  and never passes through the music's speed / reverb. No React in here. */
export class AmbienceEngine {
  /** `resolve` turns a layer's url into something fetch() can read: the Mac app passes absolute file paths (-> media://), the phone app passes ready blob / file URLs. */
  constructor(private resolve: (url: string) => string = mediaUrl) {}
  private ctx: AudioContext | null = null
  private fade: GainNode | null = null     // 0..1, the fade in / out
  private level: GainNode | null = null    // master level
  private out: GainNode | null = null      // final gain (0 only when a test run asks for silence)
  private tap: AnalyserNode | null = null
  private voices = new Map<string, Voice>()
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private done = new Map<string, AudioBuffer>()
  private layers: AmbienceLayer[] = []
  private masterDb = -20
  private wantPlaying = false
  private silent = false
  private finished = new Map<string, string>()   // layers that played to the end and are not set to repeat (kept until their tracks / loop setting change)
  private suspendTimer: ReturnType<typeof setTimeout> | undefined
  private token = 0
  readonly failed = new Set<string>()

  /** Which sounds should be layered, and how loud each is. Safe to call any time (does nothing audible until play()). */
  setLayers(layers: AmbienceLayer[]) {
    this.layers = layers
    if (this.ctx && this.wantPlaying) void this.reconcile()
    else if (this.ctx) this.applyLevels()
  }
  setMaster(db: number) {
    this.masterDb = clampMasterDb(db)
    if (this.ctx && this.level) this.level.gain.setTargetAtTime(dbToGain(this.masterDb), this.ctx.currentTime, 0.04)
  }

  /** Fade in (0.6 s). Builds the context on first use, loads (decodes + loops) whatever is not loaded yet. */
  async play() {
    this.wantPlaying = true
    clearTimeout(this.suspendTimer)
    const my = ++this.token
    if (!this.ctx) this.build()
    const ctx = this.ctx!
    if (ctx.state !== 'running') await ctx.resume()
    if (my !== this.token || !this.wantPlaying) return
    this.ramp(this.fade!, 1, AMBIENCE.fadeInSec)
    await this.reconcile()
  }

  /** Build + resume the context without making a sound. The phone calls this inside a tap, because iOS only lets an AudioContext start from a user gesture. */
  prime() {
    if (!this.ctx) this.build()
    if (this.ctx!.state !== 'running') void this.ctx!.resume().catch(() => undefined)
  }

  /** Fade out (0.8 s), then suspend the context so nothing renders. */
  pause() {
    const was = this.wantPlaying
    this.wantPlaying = false
    if (!was || !this.ctx || !this.fade) return   // already faded out / never started
    const my = ++this.token
    this.ramp(this.fade, 0, AMBIENCE.fadeOutSec)
    clearTimeout(this.suspendTimer)
    this.suspendTimer = setTimeout(() => { if (my === this.token && this.ctx?.state === 'running') void this.ctx.suspend() }, AMBIENCE.fadeOutSec * 1000 + 80)
  }

  // ---- debug / harness only ----
  setSilent(on: boolean) { this.silent = on; if (this.out) this.out.gain.value = on ? 0 : 1 }
  get state(): AudioContextState | 'none' { return this.ctx ? this.ctx.state : 'none' }
  get fadeValue() { return this.fade ? this.fade.gain.value : 0 }
  get voiceKeys() { return [...this.voices.keys()] }
  loopBuffer(key: string) { return this.done.get(key) ?? null }
  /** An analyser on the final mix (a side branch; created only when asked for). */
  debugTap() {
    if (!this.ctx || !this.level) return null
    if (!this.tap) { this.tap = this.ctx.createAnalyser(); this.tap.fftSize = 2048; this.level.connect(this.tap) }
    return this.tap
  }

  private build() {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'playback' }))
    this.fade = ctx.createGain(); this.fade.gain.value = 0
    this.level = ctx.createGain(); this.level.gain.value = dbToGain(this.masterDb)
    this.out = ctx.createGain(); this.out.gain.value = this.silent ? 0 : 1
    this.fade.connect(this.level); this.level.connect(this.out); this.out.connect(ctx.destination)
  }

  /** Decode a file once, cut it for looping, cache it. Resolves null when the file cannot be read or decoded. */
  private load(key: string, url: string, loop: boolean) {
    const ck = url + (loop ? '' : '|once')
    let p = this.buffers.get(ck)
    if (!p) {
      p = (async () => {
        try {
          const bytes = await (await fetch(this.resolve(url))).arrayBuffer()
          const src = await this.ctx!.decodeAudioData(bytes)
          if (!loop) return src   // played through as it is
          const chans = loopChannels(Array.from({ length: src.numberOfChannels }, (_, c) => src.getChannelData(c)), src.sampleRate)
          const b = this.ctx!.createBuffer(chans.length, chans[0].length, src.sampleRate)
          chans.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i))
          this.done.set(key, b); return b
        } catch { this.failed.add(key); this.buffers.delete(ck); return null }
      })()
      this.buffers.set(ck, p)
    }
    return p
  }

  private sigOf(l: AmbienceLayer) { return `${l.loop ? 'L' : 'O'}|${l.urls.join('|')}` }

  /** Make the running voices match the wanted layers: start new ones, fade out removed or changed ones, move levels. */
  private async reconcile() {
    if (!this.ctx) return
    const want = new Map(this.layers.map((l) => [l.key, l]))
    for (const [key, v] of this.voices) { const w = want.get(key); if (!w || v.sig !== this.sigOf(w)) { this.voices.delete(key); this.retire(v) } }
    for (const [key, sig] of this.finished) { const w = want.get(key); if (!w || sig !== this.sigOf(w)) this.finished.delete(key) }
    this.applyLevels()
    await Promise.all(this.layers.filter((l) => l.urls.length && !this.voices.has(l.key) && !this.finished.has(l.key)).map(async (l) => {
      const seamless = l.urls.length === 1 && l.loop
      const first = await this.load(l.key, l.urls[0], seamless)
      const cur = this.layers.find((x) => x.key === l.key)
      if (!first || !this.ctx || !this.wantPlaying || !cur || this.voices.has(l.key) || this.sigOf(cur) !== this.sigOf(l)) return   // changed meanwhile
      const gain = this.ctx.createGain(); gain.gain.value = 0; gain.connect(this.fade!)
      const v: Voice = { src: null, gain, sig: this.sigOf(l), dead: false }
      this.voices.set(l.key, v)
      // one sound at a time through the layer's list; the context is suspended while paused, so pause / play carries on exactly where it was
      const playAt = async (i: number) => {
        if (v.dead || !this.ctx) return
        const buf = i === 0 && first ? first : await this.load(l.key, l.urls[i], seamless)
        if (v.dead || !this.ctx) return
        if (!buf) { if (l.urls.length > 1) return void playAt((i + 1) % l.urls.length); return }   // unreadable file: skip it
        const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = seamless
        src.connect(gain); v.src = src; src.start()
        if (!seamless) src.onended = () => {
          if (v.dead || v.src !== src) return
          if (i + 1 < l.urls.length) void playAt(i + 1)
          else if (l.loop) void playAt(0)
          else this.finished.set(l.key, v.sig)
        }
      }
      await playAt(0)
      this.ramp(gain, dbToGain(clampSoundDb(cur.db)), AMBIENCE.switchSec)
    }))
  }
  private applyLevels() {
    if (!this.ctx) return
    for (const l of this.layers) this.voices.get(l.key)?.gain.gain.setTargetAtTime(dbToGain(clampSoundDb(l.db)), this.ctx.currentTime, 0.04)
  }
  private retire(v: Voice) {
    this.ramp(v.gain, 0, AMBIENCE.switchSec)
    v.dead = true
    setTimeout(() => { try { v.src?.stop() } catch { /* already stopped */ } v.src?.disconnect(); v.gain.disconnect() }, AMBIENCE.switchSec * 1000 + 100)
  }
  /** Linear ramp from wherever the gain is right now (so a fade interrupted half way turns round smoothly). */
  private ramp(g: GainNode, to: number, sec: number) {
    const now = this.ctx!.currentTime, p = g.gain
    if (typeof p.cancelAndHoldAtTime === 'function') p.cancelAndHoldAtTime(now)
    else { const v = p.value; p.cancelScheduledValues(now); p.setValueAtTime(v, now) }
    p.linearRampToValueAtTime(to, now + sec)
  }
}

export const ambienceEngine = new AmbienceEngine()

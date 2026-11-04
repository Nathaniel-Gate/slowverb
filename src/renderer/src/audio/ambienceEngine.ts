import { mediaUrl } from '../../../shared/mediaUrl'
import { AMBIENCE, clampMasterDb, clampSoundDb, dbToGain, loopChannels } from './ambience'

export type AmbienceLayer = { key: string; url: string; db: number; loop: boolean }   // key = rel path, url = absolute file path, db = this sound's own level
type Voice = { src: AudioBufferSourceNode; gain: GainNode; once?: boolean }

/** The ambience layer's own audio output: each chosen Sound bite loops on its own voice -> voice gain -> fade -> master level -> speakers.
 *  Its OWN AudioContext, created on the first play() and suspended whenever it is faded out, so it costs nothing while off
 *  and never passes through the music's speed / reverb. No React in here. */
export class AmbienceEngine {
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
  private finished = new Set<string>()   // play-once layers that have played to the end (not restarted until the player is paused and played again)
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
    const resumed = !this.wantPlaying
    this.wantPlaying = true
    clearTimeout(this.suspendTimer)
    if (resumed) { this.finished.clear(); for (const [k, v] of this.voices) if (v.once) { this.voices.delete(k); this.retire(v) } }   // play-once layers start again with the music
    const my = ++this.token
    if (!this.ctx) this.build()
    const ctx = this.ctx!
    if (ctx.state !== 'running') await ctx.resume()
    if (my !== this.token || !this.wantPlaying) return
    this.ramp(this.fade!, 1, AMBIENCE.fadeInSec)
    await this.reconcile()
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
  private load(l: AmbienceLayer) {
    const ck = l.url + (l.loop ? '' : '|once')
    let p = this.buffers.get(ck)
    if (!p) {
      p = (async () => {
        try {
          const bytes = await (await fetch(mediaUrl(l.url))).arrayBuffer()
          const src = await this.ctx!.decodeAudioData(bytes)
          if (!l.loop) return src   // a song layered once: play it as it is
          const chans = loopChannels(Array.from({ length: src.numberOfChannels }, (_, c) => src.getChannelData(c)), src.sampleRate)
          const b = this.ctx!.createBuffer(chans.length, chans[0].length, src.sampleRate)
          chans.forEach((c, i) => b.copyToChannel(c as Float32Array<ArrayBuffer>, i))
          this.done.set(l.key, b); return b
        } catch { this.failed.add(l.key); this.buffers.delete(ck); return null }
      })()
      this.buffers.set(l.url, p)
    }
    return p
  }

  /** Make the running voices match the wanted layers: start new ones, fade out removed ones, move levels. */
  private async reconcile() {
    if (!this.ctx) return
    const want = new Map(this.layers.map((l) => [l.key, l]))
    for (const [key, v] of this.voices) if (!want.has(key) || (v.once && want.get(key)!.loop) || (!v.once && !want.get(key)!.loop)) { this.voices.delete(key); this.retire(v) }
    this.applyLevels()
    await Promise.all(this.layers.filter((l) => !this.voices.has(l.key) && !this.finished.has(l.key)).map(async (l) => {
      const b = await this.load(l)
      const cur = this.layers.find((x) => x.key === l.key)
      if (!b || !this.ctx || !this.wantPlaying || !cur || this.voices.has(l.key)) return   // changed meanwhile
      const src = this.ctx.createBufferSource(), gain = this.ctx.createGain()
      src.buffer = b; src.loop = cur.loop; gain.gain.value = 0
      src.connect(gain); gain.connect(this.fade!); src.start()
      const v = { src, gain, once: !cur.loop }; this.voices.set(l.key, v)
      if (!cur.loop) src.onended = () => { if (this.voices.get(l.key) === v) { this.finished.add(l.key) } }
      this.ramp(gain, dbToGain(clampSoundDb(cur.db)), AMBIENCE.switchSec)
    }))
  }
  private applyLevels() {
    if (!this.ctx) return
    for (const l of this.layers) this.voices.get(l.key)?.gain.gain.setTargetAtTime(dbToGain(clampSoundDb(l.db)), this.ctx.currentTime, 0.04)
  }
  private retire(v: Voice) {
    this.ramp(v.gain, 0, AMBIENCE.switchSec)
    setTimeout(() => { try { v.src.stop() } catch { /* already stopped */ } v.src.disconnect(); v.gain.disconnect() }, AMBIENCE.switchSec * 1000 + 100)
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

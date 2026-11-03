import { masterOf } from './master'
import { shouldGrain } from './scrubGate'
import { OUTPUT } from '../config/audioOutput'
import { EDITOR_AUDIO } from '../config/editorAudio'
import { DEFAULT_FX } from '../config/fx'
import { projectEnd, type Project } from './model'
import { buildGraph, type Buffers, type Graph } from './schedule'

export type Range = { a: number; b: number }
const E = EDITOR_AUDIO

/** Pure: clamp a shuttle rate to +-shuttleMax, magnitude at least shuttleMin (0 stays 0 = stopped). */
export function clampRate(r: number): number {
  if (!Number.isFinite(r) || r === 0) return 0
  return Math.sign(r) * Math.min(E.shuttleMax, Math.max(E.shuttleMin, Math.abs(r)))
}
/** Pure: timeline position `elapsed` timeline-seconds after starting at `from`. Forward wraps inside `loop` (only when the
 *  start was inside it), reverse walks down to 0, otherwise clamps to [from, end]. */
export function positionAfter(from: number, elapsed: number, o: { reverse: boolean; end: number; loop: Range | null }): number {
  if (o.reverse) return Math.max(0, from - elapsed)
  const pos = from + elapsed
  if (o.loop && pos >= o.loop.b) return o.loop.a + ((pos - o.loop.a) % (o.loop.b - o.loop.a))
  return Math.min(o.end, Math.max(from, pos))
}

/** Live playback of a Project. Position is derived from the audio clock (never stored per frame), so it is smooth and
 *  cannot drift from what is heard. Re-call seek(p, buffers, position()) after an edit to reschedule. */
export class EditorTransport {
  private _ctx: AudioContext | null = null
  private graphs: Graph[] = []   // live graph(s): two overlap briefly at a loop seam
  private _playing = false
  private from = 0           // timeline second playback (re)started at
  private startCtx = 0       // ctx time that `from` plays at
  private factor = 1         // timeline seconds per audio second (master speed x shuttle rate)
  private end = 0            // timeline second playback stops at (project end, or the end of a play range)
  private rate = 1           // shuttle rate, negative = reverse
  private loopSet: Range | null = null
  private active: Range | null = null   // loop in effect for the current run (set only when it started inside the loop)
  private timer: ReturnType<typeof setTimeout> | undefined
  private tap: AnalyserNode | null = null
  private last: { p: Project; buffers: Buffers } | null = null
  private rangeEnd: number | null = null
  private grain: Graph | null = null; private grainAt = -1; private lastGrainT = -1
  loops = 0                  // completed loop passes scheduled in this run (diagnostics / harness)
  onEnded?: () => void

  get ctx(): AudioContext { return (this._ctx ??= new AudioContext({ latencyHint: OUTPUT.latencyHint })) }
  /** Suspend the editor's output stream while the player is the one playing. */
  idle() { if (this._ctx && !this._playing && this._ctx.state === 'running') void this._ctx.suspend() }
  get playing() { return this._playing }
  get shuttleRate() { return this.rate }
  /** Post-chain tap for meters / tests (everything the speakers get). */
  get analyser(): AnalyserNode { return (this.tap ??= this.ctx.createAnalyser()) }

  private now(): number {   // audio-clock time, interpolated between render quanta so the playhead moves smoothly
    const c = this.ctx, ts = c.getOutputTimestamp()
    if (ts.contextTime && ts.performanceTime) return Math.min(ts.contextTime + (performance.now() - ts.performanceTime) / 1000, c.currentTime + 0.02)
    return c.currentTime
  }
  position(): number {
    if (!this._playing) return this.from
    return positionAfter(this.from, Math.max(0, this.now() - this.startCtx) * this.factor, { reverse: this.rate < 0, end: this.end, loop: this.active })
  }

  setLoop(range: Range | null) {
    const same = (!range && !this.loopSet) || (!!range && !!this.loopSet && range.a === this.loopSet.a && range.b === this.loopSet.b)
    this.loopSet = range && range.b > range.a ? { ...range } : null
    if (!same && this._playing && this.last) this.seek(this.last.p, this.last.buffers, this.position())   // re-plan the run
  }
  /** Shuttle: +-0.1..8, negative = reverse (cached reversed buffers). 0 pauses. While stopped it only stores the rate for the next play(). */
  setRate(rate: number) {
    const r = clampRate(rate)
    if (r === 0) { if (rate === 0) this.pause(); return }
    this.rate = r
    if (this._playing && this.last) this.seek(this.last.p, this.last.buffers, this.position())
  }

  private stopGraphs() { clearTimeout(this.timer); this.graphs.forEach((g) => g.stop()); this.graphs = [] }

  private launch(p: Project, buffers: Buffers, from: number, lead: number, ramp: boolean) {
    const ctx = this.ctx, fx = masterOf(p), rev = this.rate < 0, mag = Math.abs(this.rate)
    const total = projectEnd(p), cap = this.rangeEnd === null ? total : Math.min(total, this.rangeEnd)
    const loop = !rev && this.loopSet && from >= this.loopSet.a && from < this.loopSet.b ? this.loopSet : null
    this.active = loop; this.loops = 0
    this.factor = Math.max(fx.speed, E.minSpeed) * mag; this.end = loop ? loop.b : cap
    this.from = Math.max(0, Math.min(from, rev ? total : this.end)); this.startCtx = ctx.currentTime + lead
    const run = (at: number, start: number, first: boolean): Graph => {
      const g = buildGraph(ctx, p, buffers, start, at, { rampIn: first ? (ramp ? E.declick : 0) : loop ? E.loopDeclick : 0, rampOut: loop ? E.loopDeclick : 0, rate: mag, reverse: rev, until: rev ? undefined : this.end })
      g.out.connect(this.analyser); this.graphs.push(g)
      while (this.graphs.length > 2) this.graphs.shift()!.stop()   // a pass two back has finished: free its chain
      return g
    }
    this._playing = true
    const arm = (g: Graph) => {
      clearTimeout(this.timer)
      const wait = (g.endCtxTime - ctx.currentTime) * 1000
      if (loop) {   // schedule the next pass ahead of time so the seam is sample accurate
        const tick = () => {
          if (this.graphs[this.graphs.length - 1] !== g) return
          const ahead = g.endCtxTime - ctx.currentTime
          if (ahead > E.loopLead + 0.02) { this.timer = setTimeout(tick, (ahead - E.loopLead) * 1000); return }
          this.loops++; arm(run(g.endCtxTime, loop.a, false))
        }
        this.timer = setTimeout(tick, Math.max(0, wait - E.loopLead * 1000))
      } else {
        this.timer = setTimeout(() => {
          if (this.graphs[this.graphs.length - 1] !== g) return
          g.stop(); this.graphs = []; this.from = rev ? 0 : this.end; this._playing = false; this.rate = 1; this.rangeEnd = null; this.onEnded?.()
        }, Math.max(0, wait + E.endSlack * 1000))
      }
    }
    arm(run(this.startCtx, this.from, true))
  }

  async play(p: Project, buffers: Buffers, from: number): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume()
    this.last = { p, buffers }; this.rangeEnd = null; this.stopGraphs()
    this.launch(p, buffers, from, E.startLead, false)
  }
  /** Play a..b then stop; with a loop set, loop a..b instead. */
  async playRange(p: Project, buffers: Buffers, a: number, b: number): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume()
    this.last = { p, buffers }; this.stopGraphs()
    const saved = this.loopSet
    if (saved) this.loopSet = { a, b }
    this.rangeEnd = b
    this.launch(p, buffers, a, E.startLead, false)
    this.loopSet = saved
  }
  pause(): number {
    const pos = this.position()
    this.stopGraphs(); this._playing = false; this.from = pos; this.rate = 1; this.rangeEnd = null
    return pos
  }
  seek(p: Project, buffers: Buffers, to: number): void {
    this.last = { p, buffers }
    if (!this._playing) { this.from = Math.max(0, to); return }
    const loopHeld = this.active   // a playRange loop is kept by re-using its own range
    this.stopGraphs()   // 10ms de-click ramp on the old graph, matching ramp-in on the new one
    const saved = this.loopSet
    if (loopHeld && this.rangeEnd !== null) this.loopSet = loopHeld
    this.launch(p, buffers, Math.max(0, to), 0.005, true)
    this.loopSet = saved
  }

  /** Scrub: one short grain (~90ms) of the project at timeline second t, played dry at normal rate. Call it while dragging the playhead. */
  scrub(p: Project, buffers: Buffers, t: number): void {
    const ctx = this.ctx, now = ctx.currentTime
    if (this._playing || !shouldGrain(this.lastGrainT, this.grainAt, t, now, { minMove: E.scrubMinMove, repeatGuard: E.scrubRepeatGuard, minInterval: E.scrubMinInterval })) return
    if (ctx.state !== 'running') void ctx.resume()
    this.grainAt = now; this.lastGrainT = Math.max(0, t); this.grain?.stop()
    this.from = Math.max(0, t)
    this.grain = buildGraph(ctx, p, buffers, this.from, now + 0.005, { bare: true, until: this.from + E.scrubGrain, rampIn: E.scrubFadeIn, rampOut: E.scrubFadeOut })
    this.grain.out.connect(this.analyser)
  }
}
export const editorTransport = new EditorTransport()

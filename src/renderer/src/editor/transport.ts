import { EDITOR_AUDIO } from '../config/editorAudio'
import { DEFAULT_FX } from '../config/fx'
import { projectEnd, type Project } from './model'
import { buildGraph, type Buffers, type Graph } from './schedule'

/** Live playback of a Project. Position is derived from the audio clock (never stored per frame), so it is smooth and
 *  cannot drift from what is heard. Re-call seek(p, buffers, position()) after an edit to reschedule. */
export class EditorTransport {
  private _ctx: AudioContext | null = null
  private graph: Graph | null = null
  private _playing = false
  private from = 0           // timeline second playback (re)started at
  private startCtx = 0       // ctx time that `from` plays at
  private speed = 1
  private end = 0            // timeline end of the current project
  private timer: ReturnType<typeof setTimeout> | undefined
  private tap: AnalyserNode | null = null
  onEnded?: () => void

  get ctx(): AudioContext { return (this._ctx ??= new AudioContext()) }
  get playing() { return this._playing }
  /** Post-chain tap for meters / tests (everything the speakers get). */
  get analyser(): AnalyserNode { return (this.tap ??= this.ctx.createAnalyser()) }

  private now(): number {   // audio-clock time, interpolated between render quanta so the playhead moves smoothly
    const c = this.ctx, ts = c.getOutputTimestamp()
    if (ts.contextTime && ts.performanceTime) return Math.min(ts.contextTime + (performance.now() - ts.performanceTime) / 1000, c.currentTime + 0.02)
    return c.currentTime
  }
  position(): number {
    if (!this._playing) return this.from
    return Math.min(this.end, Math.max(this.from, this.from + (this.now() - this.startCtx) * this.speed))
  }

  private launch(p: Project, buffers: Buffers, from: number, lead: number, ramp: boolean) {
    const ctx = this.ctx, fx = p.master ?? DEFAULT_FX
    this.speed = fx.speed; this.end = projectEnd(p); this.from = Math.min(from, this.end)
    this.startCtx = ctx.currentTime + lead
    this.graph = buildGraph(ctx, p, buffers, this.from, this.startCtx, ramp ? { rampIn: EDITOR_AUDIO.declick } : {})
    this.graph.out.connect(this.analyser)
    this._playing = true
    clearTimeout(this.timer)
    const g = this.graph
    this.timer = setTimeout(() => {
      if (this.graph !== g) return
      g.stop(); this.from = this.end; this._playing = false; this.graph = null; this.onEnded?.()
    }, Math.max(0, g.endCtxTime - ctx.currentTime + EDITOR_AUDIO.endSlack) * 1000)
  }

  async play(p: Project, buffers: Buffers, from: number): Promise<void> {
    if (this.ctx.state !== 'running') await this.ctx.resume()
    this.graph?.stop()
    this.launch(p, buffers, from, EDITOR_AUDIO.startLead, false)
  }
  pause(): number {
    const pos = this.position()
    clearTimeout(this.timer); this.graph?.stop(); this.graph = null
    this._playing = false; this.from = pos
    return pos
  }
  seek(p: Project, buffers: Buffers, to: number): void {
    if (!this._playing) { this.from = Math.max(0, to); return }
    this.graph?.stop()   // 10ms de-click ramp on the old graph, matching ramp-in on the new one
    this.launch(p, buffers, Math.max(0, to), 0.005, true)
  }
}
export const editorTransport = new EditorTransport()

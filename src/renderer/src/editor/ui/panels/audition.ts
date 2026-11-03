import { editorTransport } from '../../transport'

/** Plays a slice of one source buffer straight to the speakers (no master chain), for the Source bin. One voice at a time. */
let node: AudioBufferSourceNode | null = null, startedAt = 0, from = 0, to = 0, onStop: (() => void) | null = null

export function auditionStart(buf: AudioBuffer, a: number, b: number, done: () => void) {
  auditionStop()
  const ctx = editorTransport.ctx
  if (ctx.state !== 'running') void ctx.resume()
  const n = ctx.createBufferSource(); n.buffer = buf; n.connect(ctx.destination)
  from = Math.max(0, a); to = Math.min(buf.duration, b); startedAt = ctx.currentTime
  n.start(0, from, Math.max(0.01, to - from))
  n.onended = () => { if (node === n) { node = null; onStop = null; done() } }
  node = n; onStop = done
}
export function auditionStop() {
  const n = node, cb = onStop; node = null; onStop = null
  if (n) { n.onended = null; try { n.stop() } catch { /* already stopped */ } n.disconnect(); cb?.() }
}
/** Source-time of the audition cursor, or null when nothing plays. */
export const auditionPos = (): number | null => (node ? Math.min(to, from + editorTransport.ctx.currentTime - startedAt) : null)

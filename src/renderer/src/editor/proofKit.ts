// Shared helpers for the harness proofs (proof.ts, proof2.ts). Not shipped in the app.
import type { Clip, Project } from './model'

export const RATE = 44100
export const track = (id: string, o: Partial<{ gain: number; mute: boolean; solo: boolean }> = {}) => ({ id, name: id, mute: false, solo: false, lock: false, gain: 1, ...o })
export const clip = (id: string, src: string, tr: string, start: number, srcIn: number, srcOut: number, o: Partial<Clip> = {}): Clip =>
  ({ id, src, track: tr, start, srcIn, srcOut, gain: 1, fadeIn: 0, fadeOut: 0, ...o })
export const project = (sources: Record<string, number>, tracks: ReturnType<typeof track>[], clips: Clip[], master: Project['master'] = null): Project =>
  ({ version: 1, id: 'p', name: 'proof', song: 'x', sources: Object.fromEntries(Object.entries(sources).map(([k, d]) => [k, { duration: d }])), tracks, clips, markers: [], bpm: null, master, smoothCuts: false })   // legacy proofs expect bit-exact edges; proof3 turns smoothCuts on
export const synth = (ctx: BaseAudioContext, secs: number, f: (i: number, c: number) => number, ch = 2) => {
  const b = ctx.createBuffer(ch, Math.round(secs * RATE), RATE)
  for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = f(i, c) }
  return b
}
export const maxAbs = (a: Float32Array, from = 0, to = a.length) => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i])); return m }
export const maxDiff = (a: Float32Array, b: Float32Array, n = Math.min(a.length, b.length)) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m }
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))


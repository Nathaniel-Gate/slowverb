// Electron-harness proofs for the editor audio (bundled on the fly by main/devshot.ts under SLOWVERB_ED=1). Not shipped in the app.
import { projectEnd, type Clip, type Project } from './model'
import { loadBuffers, type Buffers } from './schedule'
import { renderProject } from './render'
import { editorTransport } from './transport'

const RATE = 44100
const track = (id: string, o: Partial<{ gain: number; mute: boolean; solo: boolean }> = {}) => ({ id, name: id, mute: false, solo: false, lock: false, gain: 1, ...o })
const clip = (id: string, src: string, tr: string, start: number, srcIn: number, srcOut: number, o: Partial<Clip> = {}): Clip =>
  ({ id, src, track: tr, start, srcIn, srcOut, gain: 1, fadeIn: 0, fadeOut: 0, ...o })
const project = (sources: Record<string, number>, tracks: ReturnType<typeof track>[], clips: Clip[], master: Project['master'] = null): Project =>
  ({ version: 1, id: 'p', name: 'proof', song: 'x', sources: Object.fromEntries(Object.entries(sources).map(([k, d]) => [k, { duration: d }])), tracks, clips, markers: [], bpm: null, master })
const synth = (ctx: BaseAudioContext, secs: number, f: (i: number, c: number) => number, ch = 2) => {
  const b = ctx.createBuffer(ch, Math.round(secs * RATE), RATE)
  for (let c = 0; c < ch; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = f(i, c) }
  return b
}
const maxAbs = (a: Float32Array, from = 0, to = a.length) => { let m = 0; for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i])); return m }
const maxDiff = (a: Float32Array, b: Float32Array, n = Math.min(a.length, b.length)) => { let m = 0; for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m }
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function runProofs(heliumPath: string) {
  const ctx = new AudioContext(), R: Record<string, unknown> = {}
  const dc = (v: number) => synth(ctx, 5, () => v)
  const bufs = (o: Record<string, AudioBuffer>): Buffers => new Map(Object.entries(o))

  // 1. gap = exact silence of the right length; total length = projectEnd
  {
    const p = project({ a: 5 }, [track('T')], [clip('1', 'a', 'T', 0, 0, 1), clip('2', 'a', 'T', 2, 0, 1)])
    const { channels, rate } = await renderProject(p, bufs({ a: dc(0.5) }))
    R.gap = { gapMaxAbs: maxAbs(channels[0], RATE * 1, RATE * 2), gapMaxAbsR: maxAbs(channels[1], RATE * 1, RATE * 2), clipMid: channels[0][RATE / 2], lengthSamples: channels[0].length, expected: projectEnd(p) * rate, rate }
  }
  // 2. two clips on two tracks sum
  {
    const p = project({ a: 5, b: 5 }, [track('T1'), track('T2')], [clip('1', 'a', 'T1', 0, 0, 2), clip('2', 'b', 'T2', 0, 0, 2)])
    const { channels } = await renderProject(p, bufs({ a: dc(0.25), b: dc(0.5) }))
    R.sum = { mid: channels[0][RATE], expected: 0.75, maxErr: Math.max(...[1000, RATE, RATE * 2 - 1000].map((i) => Math.abs(channels[0][i] - 0.75))) }
    const m = project({ a: 5, b: 5 }, [track('T1', { mute: true }), track('T2')], p.clips)
    const s = project({ a: 5, b: 5 }, [track('T1'), track('T2', { solo: true })], p.clips)
    R.muteSolo = { muteMid: (await renderProject(m, bufs({ a: dc(0.25), b: dc(0.5) }))).channels[0][RATE], soloMid: (await renderProject(s, bufs({ a: dc(0.25), b: dc(0.5) }))).channels[0][RATE] }
  }
  // 3. fades: from 0 up to clip gain, equal power midpoint, fade out to 0
  {
    const p = project({ a: 5 }, [track('T')], [clip('1', 'a', 'T', 0, 0, 2, { gain: 0.8, fadeIn: 0.5, fadeOut: 0.5 })])
    const c = (await renderProject(p, bufs({ a: dc(1) }))).channels[0]
    R.fade = { first: c[0], atFadeInEnd: c[RATE / 2], expectedGain: 0.8, atQuarter: c[RATE / 4], expectedQuarter: 0.8 * Math.sin(Math.PI / 4), plateau: c[RATE], atFadeOutStart: c[Math.round(1.5 * RATE)], last: c[c.length - 1], len: c.length }
  }
  // 4. master speed changes length (and still same graph)
  {
    const p = project({ a: 5 }, [track('T')], [clip('1', 'a', 'T', 0, 0, 2)], { speed: 0.5, pitchLock: false, wet: 0, decay: 3, damping: 0.3 })
    const { channels } = await renderProject(p, bufs({ a: dc(0.5) }))
    R.speed = { seconds: channels[0].length / RATE, expected: 4 }
  }
  // 5. untouched single clip == source (synthetic stereo, with srcIn offset to prove sample-accurate offsets)
  {
    const src = synth(ctx, 3, (i, c) => 0.6 * Math.sin(i * (0.05 + c * 0.01)))
    const p = project({ s: 3 }, [track('T')], [clip('1', 's', 'T', 0, 0, 3)])
    const { channels } = await renderProject(p, bufs({ s: src }))
    const off = project({ s: 3 }, [track('T')], [clip('1', 's', 'T', 0.5, 1, 2)])
    const o = (await renderProject(off, bufs({ s: src }))).channels
    const a = RATE * 0.5, b = RATE * 1
    R.synthNull = { lengthOk: channels[0].length === src.length, maxDiffL: maxDiff(channels[0], src.getChannelData(0)), maxDiffR: maxDiff(channels[1], src.getChannelData(1)),
      offsetMaxDiff: Math.max(...Array.from({ length: RATE }, (_, i) => Math.abs(o[0][a + i] - src.getChannelData(0)[b + i]))), preSilence: maxAbs(o[0], 0, a - 2) }
  }
  // 6. real m4a: decodeAudioData + render + null vs source; also split-in-two re-joined is identical
  try {
    const p0 = project({ [heliumPath]: 1 }, [track('T')], [])
    const buffers = await loadBuffers(p0, ctx, [heliumPath]), buf = buffers.get(heliumPath)!
    const d = buf.duration
    const whole = project({ [heliumPath]: d }, [track('T')], [clip('1', heliumPath, 'T', 0, 0, d)])
    const t0 = performance.now(), r = await renderProject(whole, buffers), ms = performance.now() - t0
    const cut = Math.round(d / 2 * buf.sampleRate) / buf.sampleRate
    const split = project({ [heliumPath]: d }, [track('T')], [clip('1', heliumPath, 'T', 0, 0, cut), clip('2', heliumPath, 'T', cut, cut, d)])
    const rs = await renderProject(split, buffers)
    R.helium = { seconds: d, rate: buf.sampleRate, channels: buf.numberOfChannels, renderedSamples: r.channels[0].length, srcSamples: buf.length, renderMs: Math.round(ms),
      maxDiffL: maxDiff(r.channels[0], buf.getChannelData(0)), maxDiffR: maxDiff(r.channels[1], buf.getChannelData(buf.numberOfChannels > 1 ? 1 : 0)), peak: maxAbs(r.channels[0]),
      splitRejoinMaxDiff: maxDiff(rs.channels[0], r.channels[0]) }
  } catch (e) { R.helium = { error: String(e) } }
  // 7. live transport: same graph through the master chain, audible, position tracks the clock, seek/pause behave
  {
    const p = project({ s: 5 }, [track('T')], [clip('1', 's', 'T', 0, 0, 3), clip('2', 's', 'T', 3.5, 0, 1)])
    const b = bufs({ s: synth(ctx, 5, (i) => 0.5 * Math.sin(i * 0.1)) }), t = editorTransport, an = t.analyser, buf = new Float32Array(an.fftSize)
    let peak = 0
    const sample = async (ms: number) => { const end = performance.now() + ms; while (performance.now() < end) { an.getFloatTimeDomainData(buf); peak = Math.max(peak, maxAbs(buf)); await sleep(20) } }
    let ended = false; t.onEnded = () => { ended = true }
    await t.play(p, b, 0.5); const w0 = performance.now(); await sample(600)
    const pos1 = t.position(), elapsed = (performance.now() - w0) / 1000
    t.seek(p, b, 2); await sample(200); const afterSeek = t.position()
    const paused = t.pause(); await sleep(150); const stable = t.position()
    t.seek(p, b, 3.2); const seekIdle = t.position()
    await t.play(p, b, 3.2); await sleep(2200)
    R.live = { ctxState: t.ctx.state, peak, posAfter600ms: pos1, elapsed, expectedPos: 0.5 + elapsed, afterSeekTo2: afterSeek, pausedAt: paused, stayedAtRest: stable === paused, seekIdle, endedFired: ended, playingAfterEnd: t.playing, finalPos: t.position() }
  }
  return R
}

// Wave-2 harness proofs (speed, disabled, crossfade, scrub, loop, reverse, bpm, peaks cache, wav depths, meter, range/normalise).
// Run inside Electron by main/devshot.ts under SLOWVERB_ED=1. Not shipped in the app.
import { encodeWav, readWavHeader } from '../audio/wav'
import { detectBpm } from './bpm'
import { createMeter } from './meter'
import { cachedPeaks, computePeaks, serialisePeaks } from './peaks'
import { renderProject, renderToWav } from './render'
import { buildGraph, type Buffers } from './schedule'
import { editorTransport } from './transport'
import { clip, maxAbs, maxDiff, project, RATE, sleep, synth, track } from './proofKit'

const sine = (f: number, amp = 0.5) => (i: number) => amp * Math.sin(2 * Math.PI * f * i / RATE)
const upCross = (x: Float32Array, a: number, b: number) => { let n = 0; for (let i = a + 1; i < b; i++) if (x[i - 1] < 0 && x[i] >= 0) n++; return n }
const rms = (x: Float32Array, a: number, b: number) => { let s = 0; for (let i = a; i < b; i++) s += x[i] * x[i]; return Math.sqrt(s / (b - a)) }
let seed = 1; const noise = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 * 2 - 1
const bufs = (o: Record<string, AudioBuffer>): Buffers => new Map(Object.entries(o))

export async function runProofs2(ctx: AudioContext, heliumPath: string) {
  const R: Record<string, unknown> = {}, T = editorTransport

  // A. clip speed: halves / doubles the length and shifts pitch by the same factor (pitch follows speed)
  {
    const b = bufs({ s: synth(ctx, 4, sine(440)) }), tr = [track('T')], out: Record<string, unknown> = {}
    for (const sp of [2, 0.5]) {
      const p = project({ s: 4 }, tr, [clip('1', 's', 'T', 0, 0, 2, { speed: sp })])
      const c = (await renderProject(p, b)).channels[0], secs = c.length / RATE, n = upCross(c, 0, c.length)
      out[`x${sp}`] = { seconds: +secs.toFixed(4), expectedSeconds: 2 / sp, hz: +(n / secs).toFixed(1), expectedHz: 440 * sp }
    }
    const m = project({ s: 4 }, tr, [clip('1', 's', 'T', 0, 0, 2, { speed: 2 })], { speed: 0.5, pitchLock: false, wet: 0, decay: 3, damping: 0.3 })
    const c = (await renderProject(m, b)).channels[0]; out.masterHalfClipDouble = { seconds: +(c.length / RATE).toFixed(4), expectedSeconds: 2, hz: +(upCross(c, 0, c.length) / (c.length / RATE)).toFixed(1), expectedHz: 440 }
    R.speed2 = out
  }
  // B. disabled clip is silent, its neighbour is not; length still follows the timeline
  {
    const p = project({ s: 4 }, [track('T1'), track('T2')], [clip('1', 's', 'T1', 0, 0, 2, { disabled: true }), clip('2', 's', 'T2', 2, 0, 1)])
    const c = (await renderProject(p, bufs({ s: synth(ctx, 4, () => 0.5) }))).channels[0]
    R.disabled = { disabledSpanMaxAbs: maxAbs(c, 0, 2 * RATE), neighbourMid: c[Math.round(2.5 * RATE)], lengthSeconds: c.length / RATE }
  }
  // C. crossfade: overlapping clips on ONE track, equal power fades; uncorrelated material keeps constant loudness
  {
    const b = bufs({ a: synth(ctx, 4, () => noise() * 0.5), b: synth(ctx, 4, () => noise() * 0.5) })
    const p = project({ a: 4, b: 4 }, [track('T')], [clip('1', 'a', 'T', 0, 0, 2, { fadeOut: 0.5 }), clip('2', 'b', 'T', 1.5, 0, 2, { fadeIn: 0.5 })])
    const c = (await renderProject(p, b)).channels[0], w = (a: number, z: number) => rms(c, Math.round(a * RATE), Math.round(z * RATE))
    const before = w(1.0, 1.4), mid = w(1.7, 1.8), after = w(2.2, 2.6), early = w(1.55, 1.65), late = w(1.85, 1.95)
    R.crossfade = { rmsBefore: +before.toFixed(4), rmsMid: +mid.toFixed(4), rmsAfter: +after.toFixed(4), earlyOverlap: +early.toFixed(4), lateOverlap: +late.toFixed(4),
      maxDeviationDb: +Math.max(...[mid, early, late, after].map((v) => Math.abs(20 * Math.log10(v / before)))).toFixed(2), lengthSeconds: c.length / RATE }
  }
  // D. range render + normalise: render a..b equals that slice of the source; normalise puts the peak at -1 dBFS
  {
    const src = synth(ctx, 4, (i) => 0.3 * Math.sin(i * 0.02) * (0.2 + i / (4 * RATE))), p = project({ s: 4 }, [track('T')], [clip('1', 's', 'T', 0, 0, 4)])
    const r = await renderProject(p, bufs({ s: src }), { range: { a: 1, b: 2 } })
    const n = await renderProject(p, bufs({ s: src }), { normalize: true })
    R.rangeNormalize = { rangeSeconds: r.channels[0].length / RATE, sliceMaxDiff: maxDiff(r.channels[0], src.getChannelData(0).subarray(RATE, 2 * RATE)), normPeak: maxAbs(n.channels[0]), expectedPeak: 10 ** (-1 / 20), gain: n.gain }
  }
  // E. reverse graph (offline): equals the source played backwards, sample for sample
  {
    const src = synth(ctx, 4, (i) => 0.5 * Math.sin(i * 0.013) * (0.2 + i / (4 * RATE)))
    const p = project({ s: 4 }, [track('T')], [clip('1', 's', 'T', 0.5, 1, 3)])   // timeline 0.5..2.5 shows source 1..3
    const off = new OfflineAudioContext(2, 2 * RATE, RATE); buildGraph(off, p, bufs({ s: src }), 2.0, 0, { reverse: true })
    const o = (await off.startRendering()).getChannelData(0), s = src.getChannelData(0), top = Math.round(2.5 * RATE)   // source sample at timeline 2.0
    const at = (shift: number) => { let m = 0; for (let i = 100; i < 1.4 * RATE; i++) m = Math.max(m, Math.abs(o[i] - s[top - i + shift])); return m }
    R.reverseOffline = { bestShift: [-1, 0, 1, 2].map((sh) => ({ sh, d: at(sh) })).sort((x, y) => x.d - y.d)[0], tailSilentMaxAbs: maxAbs(o, Math.round(1.5 * RATE) + 200, 2 * RATE) }
  }
  // F. live transport: scrub grain, loop wrap, reverse shuttle, meter
  {
    const ramp = synth(ctx, 5, (i) => (0.1 + 0.8 * i / (5 * RATE)) * Math.sin(i * 0.1)), p = project({ s: 5 }, [track('T')], [clip('1', 's', 'T', 0, 0, 5)]), b = bufs({ s: ramp })
    const an = T.analyser, buf = new Float32Array(an.fftSize)
    const peakOver = async (ms: number) => { let m = 0; const end = performance.now() + ms; while (performance.now() < end) { an.getFloatTimeDomainData(buf); m = Math.max(m, maxAbs(buf)); await sleep(15) } return m }
    T.pause()
    // scrub: a ~90ms grain at t=1s, then silence
    await ctx.resume(); T.scrub(p, b, 1.0)
    const during = await peakOver(120); await sleep(300); const after = await peakOver(100)
    R.scrub = { peakDuringGrain: +during.toFixed(3), peakAfterGrain: after, grainSeconds: 0.09, playingFlag: T.playing }
    // loop 0.5..1.5: position stays inside, wraps repeatedly, never goes silent
    T.setLoop({ a: 0.5, b: 1.5 }); await T.play(p, b, 0.6)
    let lo = 9, hi = -9, wraps = 0, prev = T.position(), quiet = 0, reads = 0; const t0 = performance.now()
    while (performance.now() - t0 < 3600) {
      const pos = T.position(); lo = Math.min(lo, pos); hi = Math.max(hi, pos); if (pos < prev - 0.3) wraps++; prev = pos
      an.getFloatTimeDomainData(buf); if (performance.now() - t0 > 300) { reads++; if (maxAbs(buf) < 0.05) quiet++ }
      await sleep(20)
    }
    R.loop = { posMin: +lo.toFixed(3), posMax: +hi.toFixed(3), wraps, scheduledPasses: T.loops, quietReads: quiet, reads, stillPlaying: T.playing }
    T.setLoop(null); T.pause()
    // reverse shuttle: plays, position falls at |rate|, and the (rising) ramp now gets quieter
    T.setRate(-1); await T.play(p, b, 4.0)
    const early = await peakOver(250), p1 = T.position(); await sleep(500)
    const late = await peakOver(250), p2 = T.position()
    const slope = async (ms: number) => { const a = T.position(), t = performance.now(); await sleep(ms); return (T.position() - a) / ((performance.now() - t) / 1000) }
    const s1 = await slope(600); T.setRate(-2); await sleep(300); const s2 = await slope(600)
    R.reverse = { rate: T.shuttleRate, earlyPeak: +early.toFixed(3), latePeak: +late.toFixed(3), quieterLater: late < early, pos: [p1, p2].map((x) => +x.toFixed(3)), slopeAtMinus1: +s1.toFixed(2), slopeAtMinus2: +s2.toFixed(2) }
    T.pause()
    T.setRate(4); await T.play(p, b, 0.5); await sleep(300); const f4 = await slope(600); T.pause()
    R.forwardShuttle = { slopeAt4x: +f4.toFixed(2), rateAfterPause: T.shuttleRate }
    // meter on the master tap
    const m = createMeter(T.ctx, an), tone = project({ s: 5 }, [track('T')], [clip('1', 's', 'T', 0, 0, 3)]), sb = bufs({ s: synth(ctx, 5, sine(220, 0.5)) })
    m.read(); await T.play(tone, sb, 0); await sleep(500); const on = m.read(); T.pause(); await sleep(1500); const off = m.read()
    R.meter = { whilePlaying: { l: +on.l.toFixed(3), r: +on.r.toFixed(3), peakL: +on.peakL.toFixed(3), clip: on.clip }, expected: 0.5, afterPause: { l: +off.l.toFixed(4), peakL: +off.peakL.toFixed(4) } }
  }
  // G. bpm on synthetic click tracks and on the real song
  {
    const click = (bpm: number) => synth(ctx, 40, (i) => { const per = 60 / bpm, t = (i / RATE) % per; return t < 0.04 ? 0.8 * Math.sin(2 * Math.PI * 1000 * t) * Math.exp(-t / 0.008) : 0 }, 1)
    R.bpmSynthetic = [80, 100, 128, 150].map((bpm) => { const t0 = performance.now(), r = detectBpm(click(bpm)); return { bpm, got: +r.bpm.toFixed(2), conf: +r.confidence.toFixed(2), ms: Math.round(performance.now() - t0) } })
  }
  // H. peaks cache: the second request for the same file never decodes
  try {
    let decodes = 0
    const decode = async () => { decodes++; const r = await fetch('media://local' + encodeURI(heliumPath)); return ctx.decodeAudioData(await r.arrayBuffer()) }
    const t0 = performance.now(), a = await cachedPeaks(heliumPath, decode), ta = performance.now() - t0
    await sleep(300)   // the put is fire-and-forget
    const t1 = performance.now(), c = await cachedPeaks(heliumPath, decode), tc = performance.now() - t1
    const same = a.peaks.levels.every((l, i) => maxDiff(l.min, c.peaks.levels[i].min) === 0 && maxDiff(l.max, c.peaks.levels[i].max) === 0)
    R.peaksCache = { firstHit: a.hit, secondHit: c.hit, decodes, firstMs: Math.round(ta), secondMs: Math.round(tc), identical: same, bytes: serialisePeaks(computePeaks(a.buffer!)).byteLength }
  } catch (e) { R.peaksCache = { error: String(e) } }
  // I. 24-bit and 32-bit WAV: headers parse, Chromium decodes them back to the same samples
  {
    const src = synth(ctx, 1, sine(330, 0.7)), p = project({ s: 1 }, [track('T')], [clip('1', 's', 'T', 0, 0, 1)]), out: Record<string, unknown> = {}
    for (const depth of [16, 24, 32] as const) {
      const wav = await renderToWav(p, bufs({ s: src }), { bitDepth: depth }), h = readWavHeader(wav)
      const dec = await ctx.decodeAudioData(wav.slice(0))
      out[`b${depth}`] = { format: h.format, bits: h.bits, ch: h.channels, rate: h.rate, frames: h.frames, riffOk: h.riffSize === wav.byteLength - 8, byteRateOk: h.byteRate === h.rate * h.blockAlign, fact: h.fact,
        decodedFrames: dec.length, decodeMaxDiff: maxDiff(dec.getChannelData(0), src.getChannelData(0)) }
    }
    out.odd24Mono = readWavHeader(encodeWav([new Float32Array(3)], 44100, 24)).dataBytes
    R.wavDepths = out
  }
  return R
}

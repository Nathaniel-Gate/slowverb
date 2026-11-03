// Wave-3 harness proofs: fade curves, volume envelope, smooth cuts / mute without clicks, sections on the real song.
// Run inside Electron by main/devshot.ts under SLOWVERB_ED=1 (SLOWVERB_ROOT must be a temp folder). Not shipped in the app.
import { renderProject } from './render'
import { buildGraph, loadBuffers, type Buffers } from './schedule'
import { detectSections, detectSilence, leadingTrailingSilence } from './sections'
import { clip, maxAbs, project, RATE, synth, track } from './proofKit'
import type { Project } from './model'

const bufs = (o: Record<string, AudioBuffer>): Buffers => new Map(Object.entries(o))
const on = (p: Project): Project => ({ ...p, smoothCuts: true })
/** largest sample-to-sample step in a..b seconds (a click shows up as a big step) */
const maxJump = (x: Float32Array, a: number, b: number) => { let m = 0; for (let i = Math.round(a * RATE) + 1; i < Math.round(b * RATE); i++) m = Math.max(m, Math.abs(x[i] - x[i - 1])); return m }
const at = (x: Float32Array, t: number) => x[Math.round(t * RATE)]

export async function runProofs3(ctx: AudioContext, heliumPath: string) {
  const R: Record<string, unknown> = {}
  const dc = synth(ctx, 6, () => 1, 1), sine = synth(ctx, 6, (i) => 0.5 * Math.sin(2 * Math.PI * 440 * i / RATE), 1)
  const naturalStep = 0.5 * 2 * Math.PI * 440 / RATE   // largest step a clean 440 Hz sine of amplitude 0.5 ever takes

  // A. every curve: fade in over 1s then out over 1s on a DC clip; sample the quarter points
  {
    const out: Record<string, unknown> = {}
    for (const c of ['lin', 'pow', 'log', 's'] as const) {
      const p = project({ d: 6 }, [track('T')], [clip('1', 'd', 'T', 0, 0, 4, { fadeIn: 1, fadeOut: 1, fadeInCurve: c, fadeOutCurve: c })])
      const x = (await renderProject(on(p), bufs({ d: dc }))).channels[0]
      out[c] = { in0: at(x, 0), in25: +at(x, 0.25).toFixed(4), in50: +at(x, 0.5).toFixed(4), in75: +at(x, 0.75).toFixed(4), in100: +at(x, 1).toFixed(4), plateau: at(x, 2),
        out50: +at(x, 3.5).toFixed(4), out100: at(x, 4 - 1 / RATE) }
    }
    R.fadeCurves = out
  }
  // B. envelope: (0,0) -> (2,1) -> hold. Linear in time, also when playback starts mid-envelope (range render) and in reverse
  {
    const env = [{ t: 0, g: 0 }, { t: 2, g: 1 }], p = on(project({ d: 6 }, [track('T')], [clip('1', 'd', 'T', 0, 0, 4, { env })]))
    const x = (await renderProject(p, bufs({ d: dc }))).channels[0]
    const r = (await renderProject(p, bufs({ d: dc }), { range: { a: 1, b: 3 } })).channels[0]
    const off = new OfflineAudioContext(1, 2 * RATE, RATE); buildGraph(off, p, bufs({ d: dc }), 2, 0, { reverse: true })
    const rv = (await off.startRendering()).getChannelData(0)
    R.envelope = { t05: +at(x, 0.5).toFixed(4), t10: +at(x, 1).toFixed(4), t15: +at(x, 1.5).toFixed(4), t30: at(x, 3), expect: [0.25, 0.5, 0.75, 1],
      rangeFrom1_at1p5: +r[Math.round(0.5 * RATE)].toFixed(4), expectRange: 0.75, reverseAtTimeline1p5: +rv[Math.round(0.5 * RATE)].toFixed(4), expectReverse: 0.75 }
  }
  // C. muteRange two ways on a continuous sine: a disabled middle piece, and an envelope dip. Silent inside, no click at the edges.
  {
    const bs = bufs({ s: sine }), tr = [track('T')]
    const split = () => project({ s: 6 }, tr, [clip('1', 's', 'T', 0, 0, 2.0003), clip('2', 's', 'T', 2.0003, 2.0003, 4.0003, { disabled: true }), clip('3', 's', 'T', 4.0003, 4.0003, 6)])   // cut points off a whole cycle, so a hard cut really steps)
    const run = async (p: Project, smooth: boolean) => (await renderProject({ ...p, smoothCuts: smooth }, bs)).channels[0]
    const a = await run(split(), true), b = await run(split(), false)
    const e = [{ t: 2, g: 1 }, { t: 2.005, g: 0 }, { t: 3.995, g: 0 }, { t: 4, g: 1 }]
    const ev = await run(project({ s: 6 }, tr, [clip('1', 's', 'T', 0, 0, 6, { env: e })]), true)
    R.muteNoClick = { naturalSineStep: +naturalStep.toFixed(4),
      disabledPiece: { silentMaxAbs: maxAbs(a, Math.round(2.01 * RATE), Math.round(3.99 * RATE)), maxJumpSmooth: +maxJump(a, 1.9, 4.1).toFixed(4), maxJumpHardCut: +maxJump(b, 1.9, 4.1).toFixed(4) },
      envelopeDip: { silentMaxAbs: maxAbs(ev, Math.round(2.006 * RATE), Math.round(3.994 * RATE)), maxJump: +maxJump(ev, 1.9, 4.1).toFixed(4), resumes: maxAbs(ev, Math.round(4.1 * RATE), Math.round(4.2 * RATE)) } }
  }
  // D. smooth cuts: a sine cut mid-phase starts with a hard step; smooth cuts remove it. A contiguous split stays bit-identical.
  {
    const bs = bufs({ s: sine }), cut = [clip('1', 's', 'T', 0, 1.00031, 3)]
    const mid = (smooth: boolean) => renderProject({ ...project({ s: 6 }, [track('T')], cut), smoothCuts: smooth }, bs).then((r) => r.channels[0])
    const hard = await mid(false), soft = await mid(true)
    const whole = (await renderProject(on(project({ s: 6 }, [track('T')], [clip('1', 's', 'T', 0, 1, 3)])), bs)).channels[0]
    const parts = (await renderProject(on(project({ s: 6 }, [track('T')], [clip('1', 's', 'T', 0, 1, 2), clip('2', 's', 'T', 1, 2, 3)])), bs)).channels[0]
    let seam = 0; for (let i = 0; i < whole.length; i++) seam = Math.max(seam, Math.abs(whole[i] - parts[i]))
    R.smoothCuts = { startJumpHard: +Math.abs(hard[0] - 0).toFixed(4), startJumpSmooth: +Math.abs(soft[0]).toFixed(4), maxJumpHard: +maxJump(hard, 0, 0.01).toFixed(4), maxJumpSmooth: +maxJump(soft, 0, 1.99).toFixed(4),
      endJumpHard: +maxJump(hard, 1.99, 1.999).toFixed(4), contiguousSplitMaxDiff: seam, naturalSineStep: +naturalStep.toFixed(4) }
  }
  // E. sections / silence on the real song
  try {
    const buffers = await loadBuffers(project({ [heliumPath]: 1 }, [track('T')], []), ctx, [heliumPath]), buf = buffers.get(heliumPath)!
    const t0 = performance.now(), s = detectSections(buf), ms = Math.round(performance.now() - t0)
    const hi = detectSections(buf, { sensitivity: 0.8 }), lo = detectSections(buf, { sensitivity: 0.3 })
    R.heliumSections = { seconds: +buf.duration.toFixed(1), ms, found: s.map((x) => ({ t: +x.t.toFixed(2), strength: +x.strength.toFixed(2) })), countLow: lo.length, countHigh: hi.length,
      silence50: detectSilence(buf, -50, 0.5).map((x) => ({ start: +x.start.toFixed(2), end: +x.end.toFixed(2) })), audibleSpan: leadingTrailingSilence(buf, -50) }
  } catch (e) { R.heliumSections = { error: String(e) } }
  return R
}

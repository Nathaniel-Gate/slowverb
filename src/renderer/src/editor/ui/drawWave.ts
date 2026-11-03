import type { Peaks } from '../peaks'
import { pickLevel } from '../peaks'
import { TL } from '../../config/timeline'
import type { EnvPoint, FadeCurve } from '../model'
import { envGainAt, fadeGain } from '../schedule'

export type WaveArgs = {
  w: number; h: number; dpr: number          // canvas size in css px + device pixel ratio
  clipLeft: number; clipW: number            // clip left edge / width in canvas-local css px (clipLeft <= 0 when the clip starts off-canvas)
  pk: Peaks | undefined; pps: number
  srcIn: number; srcOut: number
  u0: number                                 // clip-relative time (s) at the canvas left edge
  gain: number; fadeIn: number; fadeOut: number
  fadeInCurve?: FadeCurve; fadeOutCurve?: FadeCurve   // default equal power ('pow')
  env?: EnvPoint[]                                    // volume envelope: the waveform is drawn scaled by it
  speed?: number                             // clip playback rate: source seconds per timeline second (default 1)
  wave: string; fadeShade: string; fadeLine: string
}

/** Draw only the visible slice of one clip: waveform columns, gain scaling, fade triangles. */
export function drawWave(g: CanvasRenderingContext2D, o: WaveArgs) {
  const { w, h, dpr, pps } = o
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, w, h)
  const mid = h / 2, half = h / 2 - 3
  const scale = Math.min(o.gain, 10 ** (TL.gainClampDb / 20))
  if (o.pk) {
    const sp = o.speed && o.speed > 0 ? o.speed : 1
    const lvl = pickLevel(o.pk, sp / pps), spb = lvl.spp / o.pk.rate, n = lvl.max.length
    const perCol = sp / pps
    g.fillStyle = o.wave
    const env = o.env?.length ? o.env : undefined
    for (let i = 0; i < w; i++) {
      const s0 = o.srcIn + o.u0 * sp + i * perCol, s1 = s0 + perCol
      if (s1 <= o.srcIn || s0 >= o.srcOut) continue
      const b0 = Math.max(0, Math.floor(Math.max(s0, o.srcIn) / spb))
      const b1 = Math.min(n, Math.max(b0 + 1, Math.ceil(Math.min(s1, o.srcOut) / spb)))
      let mn = Infinity, mx = -Infinity
      for (let b = b0; b < b1; b++) { if (lvl.min[b] < mn) mn = lvl.min[b]; if (lvl.max[b] > mx) mx = lvl.max[b] }
      if (mn === Infinity) continue
      const k = env ? scale * envGainAt(env, o.u0 + (i + 0.5) / pps) : scale
      const yTop = Math.max(1, mid - mx * k * half), yBot = Math.min(h - 1, mid - mn * k * half)
      g.fillRect(i, yTop, 1, Math.max(1, yBot - yTop))
    }
  }
  const fi = o.fadeIn * pps, fo = o.fadeOut * pps, L = o.clipLeft, R = o.clipLeft + o.clipW
  // A fade is drawn as the area it removes: bounded by the top edge and the gain curve (fade in: rising to the right, fade out: falling).
  const shape = (dir: 'in' | 'out', x0: number, len: number, curve: FadeCurve | undefined) => {
    const n = Math.round(Math.min(TL.fadeShapeSteps * 3, Math.max(8, len / 6)))
    const pt = (j: number) => { const u = j / n; return [x0 + u * len, h * (1 - fadeGain(dir, u, curve ?? 'pow'))] as const }
    g.beginPath()
    if (dir === 'in') { g.moveTo(x0, 0); for (let j = 0; j <= n; j++) g.lineTo(...pt(j)) } else { g.moveTo(x0 + len, 0); for (let j = n; j >= 0; j--) g.lineTo(...pt(j)) }
    g.closePath(); g.fillStyle = o.fadeShade; g.fill()
    g.beginPath(); for (let j = 0; j <= n; j++) { const [x, y] = pt(j); if (j) g.lineTo(x, y); else g.moveTo(x, y) }
    g.stroke()
  }
  g.strokeStyle = o.fadeLine; g.lineWidth = 1
  if (fi > 1 && L + fi > 0) shape('in', L, fi, o.fadeInCurve)
  if (fo > 1 && R - fo < w) shape('out', R - fo, fo, o.fadeOutCurve)
}

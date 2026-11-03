import type { Peaks } from '../peaks'
import { pickLevel } from '../peaks'
import { TL } from '../../config/timeline'

export type WaveArgs = {
  w: number; h: number; dpr: number          // canvas size in css px + device pixel ratio
  clipLeft: number; clipW: number            // clip left edge / width in canvas-local css px (clipLeft <= 0 when the clip starts off-canvas)
  pk: Peaks | undefined; pps: number
  srcIn: number; srcOut: number
  u0: number                                 // clip-relative time (s) at the canvas left edge
  gain: number; fadeIn: number; fadeOut: number
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
    const lvl = pickLevel(o.pk, 1 / pps), spb = lvl.spp / o.pk.rate, n = lvl.max.length
    const perCol = 1 / pps
    g.fillStyle = o.wave
    for (let i = 0; i < w; i++) {
      const s0 = o.srcIn + o.u0 + i * perCol, s1 = s0 + perCol
      if (s1 <= o.srcIn || s0 >= o.srcOut) continue
      const b0 = Math.max(0, Math.floor(Math.max(s0, o.srcIn) / spb))
      const b1 = Math.min(n, Math.max(b0 + 1, Math.ceil(Math.min(s1, o.srcOut) / spb)))
      let mn = Infinity, mx = -Infinity
      for (let b = b0; b < b1; b++) { if (lvl.min[b] < mn) mn = lvl.min[b]; if (lvl.max[b] > mx) mx = lvl.max[b] }
      if (mn === Infinity) continue
      const yTop = Math.max(1, mid - mx * scale * half), yBot = Math.min(h - 1, mid - mn * scale * half)
      g.fillRect(i, yTop, 1, Math.max(1, yBot - yTop))
    }
  }
  const fi = o.fadeIn * pps, fo = o.fadeOut * pps, L = o.clipLeft, R = o.clipLeft + o.clipW
  const tri = (x0: number, x1: number, x2: number) => {
    g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, 0); g.lineTo(x2, h); g.closePath(); g.fillStyle = o.fadeShade; g.fill()
  }
  g.strokeStyle = o.fadeLine; g.lineWidth = 1
  if (fi > 1 && L + fi > 0) { tri(L, L + fi, L); g.beginPath(); g.moveTo(L, h); g.lineTo(L + fi, 0); g.stroke() }
  if (fo > 1 && R - fo < w) { tri(R - fo, R, R); g.beginPath(); g.moveTo(R - fo, 0); g.lineTo(R, h); g.stroke() }
}

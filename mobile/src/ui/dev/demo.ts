// DEV ONLY (?demo=1): seeds four generated-tone songs into the web platform so every screen can be screenshotted with real data.
import { platform } from '../../platform'
import { DEFAULT_FX } from '@app/config/fx'
import { PRESETS } from '@app/config/presets'

const RATE = 16000
function tone(notes: number[], secs: number, step: number): Blob {
  const n = RATE * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true)
  for (let i = 0; i < n; i++) {
    const t = i / RATE, k = Math.floor(t / step), f = notes[k % notes.length], local = t - k * step
    const env = Math.exp(-local * 3) * Math.min(1, local * 80)
    v.setInt16(44 + i * 2, Math.round((Math.sin(2 * Math.PI * f * t) * 0.6 + Math.sin(4 * Math.PI * f * t) * 0.15) * env * 0.5 * 32767), true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

/** Quiet filtered noise (white noise / rain-like) and sparse clicks (a sound bite): generated, tiny, loopable. */
function noise(secs: number, kind: 'rain' | 'hum' | 'click'): Blob {
  const n = RATE * secs, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf)
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true)
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true)
  let seed = 7, lp = 0
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1
  for (let i = 0; i < n; i++) {
    const r = rnd()
    lp += (r - lp) * (kind === 'hum' ? 0.04 : 0.4)
    const x = kind === 'click' ? (i % 4000 < 30 ? r * 0.8 : 0) : lp * (kind === 'hum' ? 1.6 : 0.7)
    v.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, x)) * 0.4 * 32767), true)
  }
  return new Blob([buf], { type: 'audio/wav' })
}

const SONGS = [
  { title: 'Midnight Drive', artist: 'Neon Harbor', notes: [220, 277.18, 329.63, 440], secs: 24, fx: PRESETS.find((p) => p.name === 'Slowed + Reverb')!.fx },
  { title: 'A Very Long Song Title That Should Be Cut Off With An Ellipsis Before It Runs Over', artist: 'The Extremely Verbose Ensemble Of Many Names', notes: [196, 246.94, 293.66, 392], secs: 18, fx: { ...DEFAULT_FX, speed: 0.85 } },
  { title: 'Glass Rooms', artist: 'Mara Lind', notes: [261.63, 329.63, 392, 523.25], secs: 20 },
  { title: 'Untitled 7', artist: '', notes: [174.61, 220, 261.63, 349.23], secs: 16, fx: PRESETS.find((p) => p.name === 'Deep Slow')!.fx }
]
const OTHERS = [
  { title: 'Rain On Glass', category: 'White noise', kind: 'rain' as const, secs: 12 },
  { title: 'Box Fan', category: 'White noise', kind: 'hum' as const, secs: 12 },
  { title: 'Vinyl Crackle', category: 'Sound bites', kind: 'click' as const, secs: 8 }
]

export async function seedDemo() {
  if ((await platform.listSongs()).length) return
  const now = Date.now()
  const rels: string[] = []
  for (const [i, s] of SONGS.entries()) {
    const blob = tone(s.notes, s.secs, 0.5), file = `${s.title}.wav`
    await platform.putSong({ title: s.title, artist: s.artist, duration: s.secs, size: blob.size, addedAt: now + i, category: 'Songs', file, ...(s.fx ? { fx: s.fx } : {}) }, blob)
    rels.push(`Songs/${file}`)
  }
  for (const [i, o] of OTHERS.entries()) {
    const blob = noise(o.secs, o.kind), file = `${o.title}.wav`
    await platform.putSong({ title: o.title, artist: '', duration: o.secs, size: blob.size, addedAt: now + 10 + i, category: o.category, file }, blob)
    rels.push(`${o.category}/${file}`)
  }
  const at = (t: string) => rels.find((r) => r.includes(t))!
  await platform.saveLists([
    { id: 'demo-late', name: 'Late night', created: now, category: 'Songs', songs: [at('Midnight Drive'), at('Glass Rooms'), at('Untitled 7')] },
    { id: 'demo-gym', name: 'Gym', created: now + 1, category: 'Songs', songs: [at('Very Long')] },
    { id: 'demo-sleep', name: 'Sleep', created: now + 2, category: 'White noise', songs: [at('Rain On Glass'), at('Box Fan')] }
  ])
}

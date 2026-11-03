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

const SONGS = [
  { title: 'Midnight Drive', artist: 'Neon Harbor', notes: [220, 277.18, 329.63, 440], secs: 24, fx: PRESETS.find((p) => p.name === 'Slowed + Reverb')!.fx },
  { title: 'A Very Long Song Title That Should Be Cut Off With An Ellipsis Before It Runs Over', artist: 'The Extremely Verbose Ensemble Of Many Names', notes: [196, 246.94, 293.66, 392], secs: 18, fx: { ...DEFAULT_FX, speed: 0.85 } },
  { title: 'Glass Rooms', artist: 'Mara Lind', notes: [261.63, 329.63, 392, 523.25], secs: 20 },
  { title: 'Untitled 7', artist: '', notes: [174.61, 220, 261.63, 349.23], secs: 16, fx: PRESETS.find((p) => p.name === 'Deep Slow')!.fx }
]

export async function seedDemo() {
  if ((await platform.listSongs()).length) return
  const now = Date.now()
  for (const [i, s] of SONGS.entries()) {
    const blob = tone(s.notes, s.secs, 0.5)
    await platform.putSong({ title: s.title, artist: s.artist, duration: s.secs, size: blob.size, addedAt: now + i, ...(s.fx ? { fx: s.fx } : {}) }, blob)
  }
}

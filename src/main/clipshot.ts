import { BrowserWindow, app, nativeImage } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { clipsPageScript, videoMakerScript } from './clipshotPage'

// Hidden-window harness for the Clips tab: SLOWVERB_CLIPS=1 SLOWVERB_ROOT=<temp dir> SLOWVERB_SHOTS=<dir for screenshots> npx electron .
// The window is never shown (show:false, no Dock icon, not focusable), all audio is muted (--mute-audio), app data lives in the
// temp root. It writes a test song, test pictures and a recorded test video, builds an edit with stills + video + a dissolve,
// checks real pixels from the compositor, saves/reloads, takes screenshots at two window sizes, prints CLIPS_RESULT and quits.
const isTemp = (p: string) => { const r = resolve(p); return [tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].some((t) => r.startsWith(resolve(t))) }

function wav(sec: number, rate = 22050): Buffer {   // quiet 220 Hz tone with a click every 0.5 s (beats to look at)
  const n = Math.round(sec * rate), b = Buffer.alloc(44 + n * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40)
  for (let i = 0; i < n; i++) { const t = i / rate, click = (t % 0.5) < 0.01 ? 0.6 : 0; b.writeInt16LE(Math.round((0.25 * Math.sin(2 * Math.PI * 220 * t) + click) * 0.5 * 32767), 44 + i * 2) }
  return b
}
function png(w: number, h: number, paint: (x: number, y: number) => [number, number, number]): Buffer {
  const px = Buffer.alloc(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const [r, g, b] = paint(x, y), i = (y * w + x) * 4; px[i] = b; px[i + 1] = g; px[i + 2] = r; px[i + 3] = 255 }   // BGRA
  return nativeImage.createFromBitmap(px, { width: w, height: h }).toPNG()
}

export function runClipsShot(win: BrowserWindow) {
  const root = process.env.SLOWVERB_ROOT, shots = process.env.SLOWVERB_SHOTS || join(root || tmpdir(), 'shots')
  if (!root || !isTemp(root)) { console.error('Refusing: SLOWVERB_ROOT must be a temp folder'); app.quit(); return }
  mkdirSync(join(root, 'Songs'), { recursive: true }); mkdirSync(join(root, 'Visuals', 'Images'), { recursive: true }); mkdirSync(join(root, 'Visuals', 'Videos'), { recursive: true }); mkdirSync(shots, { recursive: true })
  const song = join(root, 'Songs', 'Test Song.wav'); writeFileSync(song, wav(20))
  writeFileSync(join(root, 'Visuals', 'Images', 'red.png'), png(640, 360, () => [255, 0, 0]))
  writeFileSync(join(root, 'Visuals', 'Images', 'blue tall.png'), png(360, 640, () => [0, 0, 255]))
  writeFileSync(join(root, 'Visuals', 'Images', 'green square.png'), png(400, 400, () => [0, 255, 0]))
  const shot = async (name: string, w: number, h: number) => {
    win.setSize(w, h); await new Promise((r) => setTimeout(r, 900))
    const img = await win.webContents.capturePage(); const f = join(shots, name); writeFileSync(f, img.toPNG()); return { file: f, size: img.getSize() }
  }
  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 1200))
      const vid = await win.webContents.executeJavaScript(videoMakerScript())   // { b64, ext } recorded in the page (no ffmpeg on this Mac)
      if (vid?.b64) writeFileSync(join(root, 'Visuals', 'Videos', `bars.${vid.ext}`), Buffer.from(vid.b64, 'base64'))
      if (process.env.SLOWVERB_CLIPS_JS) {   // debugging: run a page snippet (an async IIFE in that file) instead of the full script
        const js = readFileSync(process.env.SLOWVERB_CLIPS_JS, 'utf8').replace('__SONG__', JSON.stringify(song)).replace('__ROOT__', JSON.stringify(root))
        console.log('CLIPS_JS ' + JSON.stringify(await win.webContents.executeJavaScript(js).catch((e: Error) => ({ error: String(e) })))); app.quit(); return
      }
      const r = await win.webContents.executeJavaScript(clipsPageScript(song, process.env.SLOWVERB_CLIPS_DOCK !== '0'))
      const out = { video: { ext: vid?.ext, bytes: vid?.b64 ? Math.round(vid.b64.length * 0.75) : 0, error: vid?.error }, ...r, shots: [await shot('clips-1100x720.png', 1100, 720), await shot('clips-1600x1000.png', 1600, 1000)] }
      await win.webContents.executeJavaScript(`window.__sv.useEditor.getState().setDock(null)`)
      out.shots.push(await shot('clips-1100x720-nodock.png', 1100, 720))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; E.getState().runCommand('clips.aspect.9:16'); E.getState().setDock('inspector') })()`)
      out.shots.push(await shot('clips-916-inspector.png', 1100, 720))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().newVersion('Empty'); E.getState().setDock('media') })()`)
      out.shots.push(await shot('clips-empty.png', 1100, 720))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; E.getState().setView('audio'); await new Promise(r => setTimeout(r, 400)) })()`)
      out.shots.push(await shot('editor-after-clips.png', 1100, 720))
      console.log('CLIPS_RESULT ' + JSON.stringify(out))
    } catch (e) { console.log('CLIPS_RESULT ' + JSON.stringify({ error: String(e) })) }
    app.quit()
  })
}

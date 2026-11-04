// Page-side scripts for the Clips harness (clipshot.ts). Plain JS strings run with executeJavaScript in the hidden window.

/** Record a 4 s test video in the page (no ffmpeg here): one colour per second (magenta, cyan, yellow, white) + a progress bar. */
export const videoMakerScript = () => `(async () => {
  try {
    const c = document.createElement('canvas'); c.width = 320; c.height = 180; const g = c.getContext('2d')
    const cols = ['#ff00ff', '#00ffff', '#ffff00', '#ffffff']
    const type = ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp8', 'video/webm'].find((t) => MediaRecorder.isTypeSupported(t))
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: type, videoBitsPerSecond: 600000 }), chunks = []
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data) }
    const t0 = performance.now(); rec.start(200)
    await new Promise((done) => { const tick = () => { const s = (performance.now() - t0) / 1000
      g.fillStyle = cols[Math.min(3, Math.floor(s))]; g.fillRect(0, 0, 320, 180); g.fillStyle = '#000'; g.fillRect(0, 168, Math.min(1, s / 4) * 320, 12)
      if (s < 4.15) setTimeout(tick, 33); else done() }; tick() })
    rec.stop(); await new Promise((r) => { rec.onstop = r })
    const bytes = new Uint8Array(await new Blob(chunks, { type }).arrayBuffer()); let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
    return { b64: btoa(bin), ext: type.includes('mp4') ? 'mp4' : 'webm' }
  } catch (e) { return { error: String(e) } }
})()`

/** Build the test edit, check compositor pixels, save + reload, undo/redo, play with the video in sync. Returns a JSON report. */
export const clipsPageScript = (song: string, dock: boolean) => `(async () => {
  const sv = window.__sv, C = sv.clips, E = sv.useEditor, wait = (ms) => new Promise((r) => setTimeout(r, ms)), out = { checks: {} }
  const song = ${JSON.stringify(song)}
  const scan = await window.api.scan([song.slice(0, song.lastIndexOf('/'))]); sv.useLibrary.getState().replace(scan.map((x, i) => ({ ...x, id: 't' + i })))
  E.getState().setView('visual'); await E.getState().openSong(song); await wait(300)
  out.emptyVisualTracks = E.getState().project.tracks.map((t) => t.id)
  await C.useClips.getState().refresh(); const items = C.useClips.getState().items
  out.items = items.map((i) => [i.name, i.kind, i.group])
  const P = (n) => items.find((i) => i.name === n).path
  out.videoProbe = await C.probe(P('bars'))
  await C.insertMedia(P('red'), 0); await C.insertMedia(P('blue tall'), 4)
  const find = (n) => E.getState().project.clips.find((c) => c.src === P(n))
  E.getState().apply((p) => sv.ops.applyCrossfade(p, find('red').id, find('blue tall').id, 1))
  await C.insertMedia(P('bars'), 9, { newTrack: true })
  await C.insertMedia(P('green square'), 13)
  const g = find('green square')
  E.getState().apply((p) => C.patchVisual(p, [g.id], { fit: 'contain' }))
  E.getState().apply((p) => sv.ops.patchClips(p, [g.id], { fadeIn: 1 }))
  out.validate = sv.ops.validate(E.getState().full)
  out.tracks = E.getState().full.tracks.map((t) => [t.id, t.kind || 'audio'])
  out.clips = E.getState().full.clips.map((c) => [c.src.split('/').pop(), c.track, +c.start.toFixed(3), +(c.start + (c.srcOut - c.srcIn) / (c.speed || 1)).toFixed(3), c.fadeIn, c.fadeOut])
  // real pixels from the compositor (offscreen canvas, same drawFrame the stage uses)
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180
  const px = (x, y) => Array.from(cv.getContext('2d').getImageData(x, y, 1, 1).data.slice(0, 3))
  const vstate = () => [...E.getState().project.clips].map((c) => C.videoPool.element(c.id)).filter(Boolean).map((v) => ({ rs: v.readyState, seeking: v.seeking, t: +v.currentTime.toFixed(3), w: v.videoWidth, paused: v.paused, err: v.error && v.error.message }))
  const frameAt = async (t) => { E.getState().setPlayhead(t); C.drawFrame(cv, t);   // the stage follows the playhead too, so both ask the video pool for the same moment
 for (let i = 0; i < 30; i++) { await wait(60); const r = C.drawFrame(cv, t); if (r.drawn >= r.layers && i > 4) break } return { c: px(160, 80), edge: px(8, 80), video: vstate(), layers: C.layersAt(E.getState().project, t).map((l) => [l.clip.src.split('/').pop(), +l.alpha.toFixed(3)]) } }
  const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  const expect = async (name, t, fn) => { const f = await frameAt(t); out.checks[name] = { t, ...f, pass: fn(f) } }
  await expect('red still', 1, (f) => near(f.c, [255, 0, 0], 12))
  await expect('dissolve red->blue', 4, (f) => f.c[0] > 45 && f.c[0] < 120 && f.c[2] > 140 && f.c[2] < 215 && f.c[1] < 20)
  await expect('blue portrait, cover', 6, (f) => near(f.c, [0, 0, 255], 12) && near(f.edge, [0, 0, 255], 12))
  await expect('video frame at 1.5 s (cyan)', 10.5, (f) => near(f.c, [0, 255, 255], 40))
  await expect('video frame at 3.5 s (white)', 12.5, (f) => near(f.c, [255, 255, 255], 40))
  await expect('green fading in from black, contain', 13.5, (f) => f.c[1] > 150 && f.c[1] < 210 && f.c[0] < 25 && near(f.edge, [0, 0, 0], 6))
  await expect('after the end: black', 18, (f) => near(f.c, [0, 0, 0], 4))
  // undo / redo across the shared history
  const n0 = E.getState().project.clips.length; E.getState().undo(); const afterUndo = find('green square').fadeIn; E.getState().undo(); const fitUndo = find('green square').fit
  E.getState().redo(); E.getState().redo()
  out.undo = { clips: n0, fadeAfterUndo: afterUndo, fitAfter2Undos: fitUndo || 'cover(default)', fadeAfterRedo: find('green square').fadeIn, fitAfterRedo: find('green square').fit, pass: afterUndo === 0 && find('green square').fadeIn === 1 }
  // the audio side is untouched
  out.audio = { clips: E.getState().sound().clips.length, tracks: E.getState().sound().tracks.map((t) => t.id) }
  // save, then read the file back
  await E.getState().flush(); const names = await window.api.editorList(song), disk = await window.api.editorLoad(song, names[0])
  out.reload = { names, same: JSON.stringify(disk) === JSON.stringify(E.getState().full), valid: sv.ops.validate(disk) }
  // play (muted) from 9.5 s: the video must follow the song clock
  const vc = find('bars'); E.getState().setPlayhead(9.5); await E.getState().togglePlay()
  const samples = []
  for (let i = 0; i < 30; i++) { await wait(60); const pos = sv.editorTransport.position(); C.drawFrame(cv, pos, true); const el = C.videoPool.element(vc.id)
    if (el && pos >= vc.start + 0.3) samples.push(+(el.currentTime - (vc.srcIn + (pos - vc.start) * (vc.speed || 1))).toFixed(3)) }
  await E.getState().togglePlay()
  out.sync = { samples: samples.slice(-6), maxDrift: Math.max(0, ...samples.slice(3).map(Math.abs)), seeks: C.videoPool.seeks, playing: E.getState().playing }
  // look for the screenshots: playhead in the dissolve, a clip selected, media dock open
  E.getState().select([find('blue tall').id]); E.getState().gotoTime(4)
  if (${dock}) E.getState().setDock('media'); await wait(500)
  out.dom = { stage: !!document.querySelector('.cl-stage canvas'), audioLane: !!document.querySelector('.cl-audio'), thumbs: document.querySelectorAll('.tl-thumbs img').length, tiles: document.querySelectorAll('.cl-tile').length, filmstrip: (C.useClips.getState().frames[P('bars')] || []).length, mode: document.querySelector('.mode')?.getAttribute('data-on') }
  return out
})()`

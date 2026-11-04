import { BrowserWindow, app } from 'electron'
import { writeFileSync } from 'fs'

/** Test harness: SLOWVERB_SHOT=out.png SLOWVERB_DIR=folder. Loads the folder like a drop, plays with a preset,
 *  proves sound reaches the output, saves a screenshot, prints JSON, quits. Not used in normal runs. */
export function runShot(win: BrowserWindow) {
  // Safety: editor tests write sidecar files and renders next to the songs, so they must never run on the real library.
  if ((process.env.SLOWVERB_EDUI || process.env.SLOWVERB_EDUI3 || process.env.SLOWVERB_DRAGPERF || process.env.SLOWVERB_AUDIOHEALTH || process.env.SLOWVERB_PERF || process.env.SLOWVERB_NEWTRACK || process.env.SLOWVERB_DUPDRAG || process.env.SLOWVERB_SYNC || process.env.SLOWVERB_GAP || process.env.SLOWVERB_MARKHOVER || process.env.SLOWVERB_TINY || process.env.SLOWVERB_BOUNCE || process.env.SLOWVERB_PLAYEDIT || process.env.SLOWVERB_CLICKEDITOR || process.env.SLOWVERB_SAVECLOSE || process.env.SLOWVERB_TRACKFX || process.env.SLOWVERB_LOOP || process.env.SLOWVERB_TIDY || process.env.SLOWVERB_AUTOPLAY || process.env.SLOWVERB_AMBIENCE || process.env.SLOWVERB_DETACHKEY || process.env.SLOWVERB_TAILDRAG || process.env.SLOWVERB_PHONE || process.env.SLOWVERB_SCRUB || process.env.SLOWVERB_ED || process.env.SLOWVERB_PL || process.env.SLOWVERB_LIB) && !process.env.SLOWVERB_ROOT) { console.error('Refusing: set SLOWVERB_ROOT to a temp folder'); app.quit(); return }
  win.webContents.once('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 1200))
    const js = `(async () => {
      const sv = window.__sv, r = await window.api.scan([${JSON.stringify(process.env.SLOWVERB_DIR)}])
      sv.useLibrary.getState().replace(r.map((x, i) => ({ ...x, id: 't' + i })))
      sv.useFx.getState().applyPreset(${JSON.stringify(process.env.SLOWVERB_PRESET || 'Slowed + Reverb')})
      sv.usePlayer.getState().play('t0')
      const an = sv.engine.ctx.createAnalyser(); sv.engine.out.connect(an)
      const buf = new Float32Array(an.fftSize); let peak = 0
      for (let i = 0; i < 20; i++) { await new Promise(r => setTimeout(r, 100)); an.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)) }
      const e = sv.engine.el
      const ex = await sv.exportCheck()
      e.currentTime = 10; await new Promise(r => setTimeout(r, 300))
      return { ex, seekedTo: e.currentTime, duration: e.duration, seekable: e.seekable.length && e.seekable.end(0), tracks: r.length, rate: e.playbackRate, preservesPitch: e.preservesPitch, time: e.currentTime, paused: e.paused, peak, error: e.error && e.error.message }
    })()`
    if (process.env.SLOWVERB_ED) {
      // Editor-audio proofs: bundle renderer/src/editor/proof.ts with rolldown (already a build dependency), run it in the page.
      const { createRequire } = await import('module'), { join } = await import('path')
      const { rolldown } = createRequire(process.cwd() + '/')('rolldown')
      const bundle = await rolldown({ input: join(process.cwd(), 'src/renderer/src/editor/proof.ts'), logLevel: 'silent' })
      const { output } = await bundle.generate({ format: 'iife', name: 'EDP' })
      const ed = await win.webContents.executeJavaScript(output[0].code + `\n;EDP.runProofs(${JSON.stringify(process.env.SLOWVERB_HELIUM || process.env.SLOWVERB_ROOT + '/Helium.m4a')})`).catch((e: Error) => ({ error: String(e) }))
      const img = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
      console.log('ED_RESULT ' + JSON.stringify(ed)); app.quit(); return
    }
    if (process.env.SLOWVERB_SCRUB) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, song = ${JSON.stringify(process.env.SLOWVERB_SCRUB)}, out = {}
        const base = sv.ops.newProject(song, 3), buffers = await sv.loadBuffers(base, sv.editorTransport.ctx)
        const hz = (ch, rate) => { let z = 0; for (let i = 1; i < ch.length; i++) if (ch[i - 1] <= 0 && ch[i] > 0) z++; return z / (ch.length / rate) }
        const grain = async (master, opts) => {
          const p = { ...base, master }, ctx = new OfflineAudioContext(2, 44100, 44100)
          sv.buildGraph(ctx, p, buffers, 0.5, 0, { until: 0.5 + 0.5, ...opts })
          const buf = await ctx.startRendering(), ch = buf.getChannelData(0)
          let last = 0; for (let i = 0; i < ch.length; i++) if (Math.abs(ch[i]) > 0.001) last = i
          return { hz: +hz(ch.slice(0, last), 44100).toFixed(0), sec: +(last / 44100).toFixed(2) }
        }
        const slow = { speed: 0.5, pitchLock: false, wet: 0, decay: 2, damping: 0.3 }
        out.normalMaster = await grain(null, { speedOnly: true })
        out.slowedMaster_speedOnly = await grain(slow, { speedOnly: true })
        out.slowedMaster_bare_old = await grain(slow, { bare: true })
        return out })()`)
      console.log('SCRUB_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_PHONE) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        const scan = await window.api.scan([${JSON.stringify(process.env.SLOWVERB_PHONE)}])
        sv.useLibrary.getState().replace(scan.map((x, i) => ({ ...x, id: 't' + i })))
        sv.usePlayer.getState().select('t0'); await wait(800)
        sv.useFx.getState().applyPreset('Slowed + Reverb'); await wait(300)
        const btn = [...document.querySelectorAll('button')].find(b => /SEND TO PHONE/.test(b.textContent))
        out.found = !!btn; out.disabled = btn && btn.disabled
        btn.click()
        for (let i = 0; i < 60 && !/SENT|FAILED/.test(btn.textContent); i++) await wait(250)
        out.label = btn.textContent; out.title = btn.title
        return out })()`)
      console.log('PHONE_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_TAILDRAG) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_TAILDRAG)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        for (const t of [10, 12]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        const mid = E.getState().project.clips.find(c => Math.abs(c.start - 10) < 0.01)
        E.getState().select([mid.id]); E.getState().makeLoopFromSelection(4, 0.05)
        E.getState().select(E.getState().project.clips.filter(c => c.loop).map(c => c.id))
        E.getState().setZoom(60, 9.5); E.getState().setScroll(9.5 * 60) })()`)
      await wait(900)
      const spans = `(() => { const p = window.__sv.useEditor.getState().project; const l = p.loops && p.loops[0]; return { count: l && l.count, tail: l && l.tail, repeats: p.clips.filter(c => c.loop).map(c => [+c.start.toFixed(2), +(c.start + c.srcOut - c.srcIn).toFixed(2)]) } })()`
      const before = await win.webContents.executeJavaScript(spans)
      const pos = await win.webContents.executeJavaScript(`(() => { const h = document.querySelector('[data-loop-handle="tail"]'); if (!h) return null; const b = h.getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } })()`)
      if (!pos) { console.log('TAILDRAG_RESULT ' + JSON.stringify({ error: 'no tail handle', before })); app.quit(); return }
      win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x, y: pos.y })
      win.webContents.sendInputEvent({ type: 'mouseDown', x: pos.x, y: pos.y, button: 'left', clickCount: 1 })
      for (let i = 1; i <= 20; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x + i * 6, y: pos.y, button: 'left', modifiers: ['leftbuttondown'] }); await wait(16) }
      win.webContents.sendInputEvent({ type: 'mouseUp', x: pos.x + 120, y: pos.y, button: 'left', clickCount: 1 })
      await wait(500)
      const after = await win.webContents.executeJavaScript(spans)
      const valid = await win.webContents.executeJavaScript(`window.__sv.ops.validate(window.__sv.useEditor.getState().project)`)
      console.log('TAILDRAG_RESULT ' + JSON.stringify({ before, after, valid })); app.quit(); return
    }
    if (process.env.SLOWVERB_DETACHKEY) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_DETACHKEY)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        for (const t of [10, 12]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        const mid = E.getState().project.clips.find(c => Math.abs(c.start - 10) < 0.01)
        E.getState().select([mid.id]); E.getState().makeLoopFromSelection(4, 0.05)
        E.getState().select(E.getState().project.clips.filter(c => c.loop).map(c => c.id)); if (${process.env.SLOWVERB_DOCK ? 'true' : 'false'}) E.getState().setDock('inspector') })()`)
      await wait(1200)
      const spans = `(() => { const p = window.__sv.useEditor.getState().project; return p.clips.map(c => [c.loop ? 'L' : 'plain', +c.start.toFixed(3), +(c.start + c.srcOut - c.srcIn).toFixed(3), c.fadeIn, c.fadeOut]) })()`
      const spansBefore = await win.webContents.executeJavaScript(spans)
      const snap = `(() => { const p = window.__sv.useEditor.getState().project; return { count: p.loops && p.loops[0] && p.loops[0].count, tagged: p.clips.filter(c => c.loop).length, plainAfter10: p.clips.filter(c => !c.loop && c.start >= 10 && c.start < 20).length, sel: window.__sv.useEditor.getState().selection.length, open: window.__sv.useEditor.getState().open, focus: document.activeElement && document.activeElement.tagName } })()`
      const before = await win.webContents.executeJavaScript(snap)
      win.webContents.focus()
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'R', modifiers: ['alt'] })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'R', modifiers: ['alt'] })
      await wait(1800)
      const after = await win.webContents.executeJavaScript(snap)
      const toast = await win.webContents.executeJavaScript(`JSON.stringify(window.__sv.useEditor.getState().toast)`)
      console.log('DETACHKEY_SPANS ' + JSON.stringify({ spansBefore, spansAfter: await win.webContents.executeJavaScript(spans) })); console.log('DETACHKEY_RESULT ' + JSON.stringify({ before, after, toast })); app.quit(); return
    }
    if (process.env.SLOWVERB_AUTOPLAY) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, P = sv.usePlayer, S = sv.useSettings, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        const scan = await window.api.scan([${JSON.stringify(process.env.SLOWVERB_AUTOPLAY)}])
        sv.useLibrary.getState().replace(scan.map((x, i) => ({ ...x, id: 't' + i })))
        await wait(500)
        const rows = () => [...document.querySelectorAll('.item')]
        out.defaults = { playOnClick: S.getState().playOnClick, playAfterAdd: S.getState().playAfterAdd, autoAdvance: S.getState().autoAdvance }
        rows()[0].click(); await wait(1800)
        out.clickDefault = { cur: P.getState().cur, playing: P.getState().playing, elPaused: sv.engine.el.paused }
        S.getState().set({ playOnClick: true }); rows()[1].click(); await wait(1800)
        out.clickOn = { cur: P.getState().cur, playing: P.getState().playing, elPaused: sv.engine.el.paused }
        S.getState().set({ playOnClick: false }); P.getState().stop(); await wait(300)
        // editor view: reach the end of a song -> nothing else starts
        P.getState().select('t0'); await wait(800)
        await E.getState().openSong(scan[0].path)
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        E.getState().setPlayhead(18.5); await E.getState().togglePlay(); await wait(3800)
        out.editorEnd = { cur: P.getState().cur, playing: P.getState().playing, editorPlaying: E.getState().playing, pos: +E.getState().now().toFixed(1) }
        E.getState().close(); await wait(500)
        // player view: end of song with auto-advance ON then OFF
        const endRun = async (adv) => {
          S.getState().set({ autoAdvance: adv }); P.getState().select('t0'); await wait(1200)
          sv.engine.el.currentTime = 18.2; await sv.engine.ctx.resume(); await sv.engine.el.play(); await wait(3500)
          return { cur: P.getState().cur, playing: P.getState().playing }
        }
        out.playerEndAdvanceOn = await endRun(true)
        out.playerEndAdvanceOff = await endRun(false)
        return out })()`)
      console.log('AUTOPLAY_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_AMBIENCE) {
      // Ambience layer proofs. SLOWVERB_ROOT = temp library holding Songs/<song> and Sound bites/<sounds>. MUTED: the page's audio output is switched off,
      // the analysers still see everything.
      win.webContents.setAudioMuted(true)
      if (process.env.SLOWVERB_AMBIENCE === 'empty') {   // library without Sound bites: just the empty state, screenshot
        const e = await win.webContents.executeJavaScript(`(async () => { const w = (ms) => new Promise(r => setTimeout(r, ms)); await window.__sv.usePlaylists.getState().refresh(); await w(600)
          const el = document.querySelector('.amb'); el && el.scrollIntoView({ block: 'center' }); await w(500); return { text: document.querySelector('.amb-empty') && document.querySelector('.amb-empty').textContent, chips: document.querySelectorAll('.amb .chip').length, ctx: window.__sv.ambienceEngine.state } })()`)
        const im = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, im.toPNG()); console.log('AMBIENCE_RESULT ' + JSON.stringify(e)); app.quit(); return
      }
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, P = sv.usePlayer, A = sv.useAmbience, AE = sv.ambienceEngine, E = sv.useEditor, L = sv.useLibrary, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        sv.engine.el.muted = true; AE.setSilent(true)
        await sv.usePlaylists.getState().refresh(); await wait(600)
        out.library = L.getState().tracks.map(t => t.path.slice(sv.usePlaylists.getState().root.length + 1))
        const song = L.getState().tracks.find(t => t.path.includes('/Songs/')), id = song.id
        const level = async (ms = 500) => { const an = AE.debugTap(); if (!an) return null; const b = new Float32Array(an.fftSize); let pk = 0, sq = 0, n = 0; const t0 = performance.now()
          while (performance.now() - t0 < ms) { an.getFloatTimeDomainData(b); for (const v of b) { pk = Math.max(pk, Math.abs(v)); sq += v * v; n++ } await wait(40) }
          return { peak: +pk.toFixed(4), rms: +Math.sqrt(sq / n).toFixed(4) } }
        const snap = () => ({ ctx: AE.state, fade: +AE.fadeValue.toFixed(3), voices: AE.voiceKeys, playing: P.getState().playing, viaEdit: P.getState().viaEdit, editorOpen: E.getState().open })
        const RAIN = 'Sound bites/Rain.wav', BIRDS = 'Sound bites/Birds.wav', TONE = 'Sound bites/Nature/Tone.wav'
        // empty state first (no sounds in the library view is simulated by checking the real panel text after we know the list)
        out.panelBefore = { empty: !!document.querySelector('.amb-empty'), chips: [...document.querySelectorAll('.amb .chip')].map(c => c.textContent) }
        out.freshStart = { ctx: AE.state }                                  // never built: costs nothing while off
        sv.useFx.getState().applyPreset('Slowed + Reverb')
        P.getState().play(id); await wait(1500)
        out.playingButOff = snap()
        A.getState().setOn(true); await wait(900)
        out.onNoSoundChosen = snap()                                        // on, music playing, nothing chosen: still no context
        A.getState().setLevel(-20)
        out.solo = {}
        for (const rel of [RAIN, BIRDS, TONE]) {
          A.getState().toggleSound(rel); await wait(1300)
          const lv = await level(700); out.solo[rel] = { ...lv, voices: AE.voiceKeys, failed: [...AE.failed] }
          A.getState().toggleSound(rel); await wait(700)
        }
        // seam: the cut loop buffers have no jump at the loop point
        out.seams = {}
        A.getState().toggleSound(RAIN); A.getState().toggleSound(BIRDS); A.getState().toggleSound(TONE); await wait(1500)
        for (const rel of [RAIN, BIRDS, TONE]) {
          const b = AE.loopBuffer(rel); if (!b) { out.seams[rel] = null; continue }
          const c = b.getChannelData(0); let d = 0; for (let i = 1; i < c.length; i++) d += (c[i] - c[i - 1]) ** 2
          const typ = Math.sqrt(d / (c.length - 1)), seam = Math.abs(c[0] - c[c.length - 1])
          let hard = null; out.seams[rel] = { sec: +b.duration.toFixed(2), seam: +seam.toFixed(4), typicalStep: +typ.toFixed(4), ok: seam < typ * 5 }
        }
        // layering + separate levels
        out.layered = { voices: AE.voiceKeys, ...(await level(900)) }
        A.getState().setSoundLevel(RAIN, -24); A.getState().setSoundLevel(BIRDS, -24); await wait(500); const toneOnly = await level(900)
        A.getState().setSoundLevel(RAIN, 0); A.getState().setSoundLevel(BIRDS, 0); A.getState().setSoundLevel(TONE, -24); await wait(500); const toneQuiet = await level(900)
        out.perSound = { toneLoudRms: toneOnly.rms, toneQuietRms: toneQuiet.rms }
        A.getState().setSoundLevel(TONE, 0)
        A.getState().toggleSound(BIRDS); A.getState().toggleSound(TONE); await wait(900)   // rain only, to compare
        A.getState().setLevel(-12); await wait(500); const hi = await level(1000); A.getState().setLevel(-36); await wait(500); const lo = await level(1000)
        out.master = { hiRms: hi.rms, loRms: lo.rms, ratio: +(lo.rms / hi.rms).toFixed(3), expect: 0.063 }
        A.getState().setLevel(-20)
        // independent of the music's speed / reverb
        const slow = await level(1000); sv.useFx.getState().set({ speed: 1, wet: 0 }); await wait(300); const orig = await level(1000)
        out.fxIndependent = { slowedRms: slow.rms, originalRms: orig.rms }
        // the switch stops it, the switch starts it
        A.getState().setOn(false); await wait(1300); out.switchOff = snap()
        A.getState().setOn(true); await wait(1100); out.switchOn = { ...snap(), ...(await level()) }
        // the player pausing stops it, resuming starts it
        P.getState().toggle(); await wait(1400); out.playerPaused = snap()
        P.getState().toggle(); await wait(1300); out.playerResumed = { ...snap(), ...(await level()) }
        // remembered by path: saved settings
        A.getState().toggleSound(TONE); A.getState().setSoundLevel(TONE, -9); await wait(900)
        const saved = await window.api.load(); out.saved = saved && saved.settings
        A.getState().toggleSound(TONE)
        // a chosen sound whose file is gone is skipped, the choice is kept
        A.getState().toggleSound('Sound bites/Missing.wav'); await wait(600)
        out.missingChoice = { voices: AE.voiceKeys, kept: A.getState().sounds.map(s => s.rel) }
        A.getState().toggleSound('Sound bites/Missing.wav')
        // editor tab playing alone: silent
        await E.getState().openSong(song.path)
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        await wait(1300); out.editorOpenIdle = snap()
        if (!E.getState().playing) await E.getState().togglePlay()
        await wait(1500); out.editorPlayingAlone = { ...snap(), editorPlaying: E.getState().playing }
        if (E.getState().playing) await E.getState().togglePlay()
        // edit playback in the player view (viaEdit): ambience follows it too
        for (const t of [45, 100]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        E.getState().select(E.getState().project.clips.filter(c => c.start >= 44 && c.start < 46).map(c => c.id)); E.getState().deleteSelection(true)
        E.getState().close(); await wait(900)
        if (!P.getState().viaEdit) { P.getState().select(id); await wait(900) }
        if (!P.getState().playing) { P.getState().toggle(); await wait(1500) } else await wait(900)
        out.viaEditPlaying = { ...snap(), ...(await level()) }
        P.getState().toggle(); await wait(1400); out.viaEditPaused = snap()
        P.getState().toggle(); await wait(1300); out.viaEditResumed = { ...snap(), ...(await level(300)) }
        A.getState().toggleSound(BIRDS); await wait(400)
        document.querySelector('.amb') && document.querySelector('.amb').scrollIntoView({ block: 'center' }); await wait(500)
        out.finalPanel = { sw: document.querySelector('.amb .set-sw') && document.querySelector('.amb .set-sw').dataset.on, chips: [...document.querySelectorAll('.amb .chip')].map(c => c.textContent + (c.classList.contains('on') ? '*' : '')), knobs: [...document.querySelectorAll('.amb .knob')].map(k => k.textContent) }
        return out })()`).catch((e: Error) => ({ error: String(e) }))
      const img = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
      console.log('AMBIENCE_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_TIDY) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_TIDY)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        E.getState().apply(p => sv.ops.addTrack(sv.ops.addTrack(p)))
        out.start = E.getState().project.tracks.length
        E.getState().toggleAutoDelete(); out.afterEnable = { tracks: E.getState().project.tracks.map(t => t.name), flag: E.getState().project.autoDeleteEmpty }
        E.getState().apply(p => sv.ops.addTrack(p)); out.newEmptyKept = E.getState().project.tracks.length
        const c = E.getState().project.clips[0]; E.getState().apply(p => sv.ops.moveClips(p, [c.id], 0, 1)); await wait(100)
        out.afterMove = E.getState().project.tracks.map(t => t.name); out.clipTrack = E.getState().project.tracks.findIndex(t => t.id === E.getState().project.clips[0].track)
        E.getState().undo(); await wait(100); out.afterUndo = E.getState().project.tracks.map(t => t.name)
        return out })()`)
      console.log('TIDY_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_LOOP) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_LOOP)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        for (const t of [10, 12]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        const mid = E.getState().project.clips.find(c => Math.abs(c.start - 10) < 0.01)
        E.getState().select([mid.id]); const h0 = E.getState().hist.past.length
        E.getState().makeLoopFromSelection(4, 0.05); await wait(300)
        const L0 = E.getState().project.loops[0], members = E.getState().project.clips.filter(c => c.loop)
        out.made = { loops: E.getState().project.loops.length, repeats: members.length, span: +(L0.count * (L0.srcOut - L0.srcIn - L0.xfade) + L0.xfade).toFixed(3), starts: members.map(c => +c.start.toFixed(3)), fades: members.map(c => c.fadeIn) }
        out.valid = sv.ops.validate(E.getState().project)
        const h1 = E.getState().hist.past.length
        for (let i = 0; i < 5; i++) { E.getState().nudgeLoop('in', 0.001); await wait(20) }
        const L1 = E.getState().project.loops[0]; out.nudgedIn = +(L1.srcIn - L0.srcIn).toFixed(4); out.undoStepsForFiveNudges = E.getState().hist.past.length - h1
        E.getState().updateLoopLive(L1.id, { xfade: 0.08 }, 'xf'); E.getState().updateLoopLive(L1.id, { xfade: 0.09 }, 'xf'); await wait(50)
        out.xfade = E.getState().project.loops[0].xfade; out.fadeNow = E.getState().project.clips.filter(c => c.loop)[1].fadeIn
        E.getState().updateLoopLive(L1.id, { count: 8 }); await wait(100); out.count8 = E.getState().project.clips.filter(c => c.loop).length
        out.valid2 = sv.ops.validate(E.getState().project)
        const r2 = await sv.renderProject(E.getState().project, E.getState().buffers, { bitDepth: 16 })
        out.renderLen = +(r2.channels[0].length / r2.rate).toFixed(2)
        E.getState().unloopSelection(); await wait(100); out.afterUnloop = { loops: (E.getState().project.loops || []).length, loopTagged: E.getState().project.clips.filter(c => c.loop).length }
        E.getState().undo(); await wait(100); out.undoRestoresLoop = (E.getState().project.loops || []).length
        return out })()`)
      console.log('LOOP_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_TRACKFX) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, song = ${JSON.stringify(process.env.SLOWVERB_TRACKFX)}, out = {}
        const base = sv.ops.newProject(song, 3), id = base.tracks[0].id
        const buffers = await sv.loadBuffers(base, sv.editorTransport.ctx)
        const rms = (ch, a, b) => { let s = 0; for (let i = a; i < b; i++) s += ch[i] * ch[i]; return Math.sqrt(s / Math.max(1, b - a)) }
        const run = async (fx) => { const p = sv.ops.setTrack(base, id, { fx }); const r = await sv.renderProject(p, buffers, { bitDepth: 16 }); return r }
        const plain = await run(undefined), rate = plain.rate, n = Math.floor(rate * 2.5)
        out.plainRms = +rms(plain.channels[0], Math.floor(rate * 0.5), n).toFixed(4)
        const low = await run({ low: 12, mid: 0, high: 0 }); out.lowShelfRatio = +(rms(low.channels[0], Math.floor(rate * 0.5), n) / out.plainRms).toFixed(2)
        const high = await run({ low: 0, mid: 0, high: 12 }); out.highShelfRatio = +(rms(high.channels[0], Math.floor(rate * 0.5), n) / out.plainRms).toFixed(2)
        const cut = await run({ low: -12, mid: 0, high: 0 }); out.lowCutRatio = +(rms(cut.channels[0], Math.floor(rate * 0.5), n) / out.plainRms).toFixed(2)
        const rev = await run({ low: 0, mid: 0, high: 0, reverb: { wet: 0.5, decay: 2, damping: 0.3 } })
        out.plainLen = +(plain.channels[0].length / rate).toFixed(2); out.reverbLen = +(rev.channels[0].length / rate).toFixed(2)
        out.tailRms = +rms(rev.channels[0], Math.floor(rate * 3.2), Math.floor(rate * 3.8)).toFixed(4); out.plainTailRms = +rms(plain.channels[0], Math.min(plain.channels[0].length - 1, Math.floor(rate * 3.2)), plain.channels[0].length).toFixed(4)
        return out })()`)
      console.log('TRACKFX_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_SAVECLOSE) {
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_SAVECLOSE)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        E.getState().setPlayhead(50); E.getState().splitAtPlayhead(); E.getState().setPlayhead(90); E.getState().splitAtPlayhead() })()`)
      win.on('closed', () => { console.log('SAVECLOSE_CLOSED'); app.quit() })
      win.close()      // right after the edit, well inside the autosave delay
      return
    }
    if (process.env.SLOWVERB_CLICKEDITOR) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        await wait(1500)
        out.tracks = sv.useLibrary.getState().tracks.length; out.cur = sv.usePlayer.getState().cur
        const btn = [...document.querySelectorAll('.mode button')].find(b => /editor/i.test(b.textContent))
        out.disabled = btn && btn.disabled
        if (btn && !btn.disabled) btn.click()
        for (let i = 0; i < 60 && !sv.useEditor.getState().open; i++) await wait(100)
        await wait(1200)
        out.open = sv.useEditor.getState().open; out.project = !!sv.useEditor.getState().project; out.busy = sv.useEditor.getState().busy
        out.timelineInDom = !!document.querySelector('.tl-lanes')
        return out })()`)
      if (process.env.SLOWVERB_TIDYON) await win.webContents.executeJavaScript(`window.__sv.useEditor.getState().toggleAutoDelete()`)
      await new Promise((res) => setTimeout(res, 900)); const shotImg = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, shotImg.toPNG())
      console.log('CLICKEDITOR_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_PLAYEDIT) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, P = sv.usePlayer, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        const scan = await window.api.scan([${JSON.stringify(process.env.SLOWVERB_PLAYEDIT)}])
        sv.useLibrary.getState().replace(scan.map((x, i) => ({ ...x, id: 't' + i })))
        P.getState().play('t0'); await wait(2500)
        out.fileMode = { viaEdit: P.getState().viaEdit, playing: P.getState().playing, elPaused: sv.engine.el.paused }
        await E.getState().openSong(scan[0].path)
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        for (const t of [45, 100]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        E.getState().select(E.getState().project.clips.filter(c => c.start >= 44 && c.start < 46).map(c => c.id)); E.getState().deleteSelection(true)
        out.editEnd = +E.getState().project.clips.reduce((m, c) => Math.max(m, c.start + c.srcOut - c.srcIn), 0).toFixed(1)
        E.getState().close(); await wait(600)
        out.afterClose = { viaEdit: P.getState().viaEdit, playing: P.getState().playing, elPaused: sv.engine.el.paused, editorPlaying: E.getState().playing }
        P.getState().seek(43); await wait(2500)
        out.afterSeek = { pos: +E.getState().now().toFixed(1), playing: P.getState().playing, elPaused: sv.engine.el.paused }
        P.getState().toggle(); await wait(400); out.paused = { playing: P.getState().playing, editorPlaying: E.getState().playing }
        P.getState().toggle(); await wait(600); out.resumed = { playing: P.getState().playing, editorPlaying: E.getState().playing }
        P.getState().stop(); await wait(300); out.stopped = { viaEdit: P.getState().viaEdit, editorPlaying: E.getState().playing }
        return out })()`)
      console.log('PLAYEDIT_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_BOUNCE) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_BOUNCE)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        for (const t of [20, 40]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        const cs = () => E.getState().project.clips.map(c => [c.src.split('/').pop(), +c.start.toFixed(2), +(c.srcOut - c.srcIn).toFixed(2), c.gain, c.fadeIn])
        const mid = E.getState().project.clips.find(c => Math.abs(c.start - 20) < 0.01)
        E.getState().select([mid.id]); E.getState().patchSelected({ fadeIn: 3, fadeOut: 3, gain: 0.5 })
        E.getState().select(E.getState().project.clips.filter(c => c.start < 41).map(c => c.id))
        out.before = cs()
        await E.getState().bounceSelection(); await wait(500)
        out.after = cs(); out.toast = E.getState().toast && E.getState().toast.text; out.busy = E.getState().busy
        const b = E.getState().project.clips.find(c => c.name === 'Bounce')
        out.hasBuffer = !!(b && E.getState().buffers.get(b.src)); out.bounceDur = b && +(b.srcOut - b.srcIn).toFixed(2)
        E.getState().undo(); await wait(300); out.afterUndo = cs().length
        return out })()`)
      console.log('BOUNCE_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_TINY) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_TINY)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        E.getState().setPlayhead(12); E.getState().splitAtPlayhead(); E.getState().setPlayhead(12.097); E.getState().splitAtPlayhead()
        E.getState().select([]); E.getState().setZoom(8, 0); E.getState().setScroll(0) })()`)
      await wait(900)
      const info = await win.webContents.executeJavaScript(`(() => { const E = window.__sv.useEditor.getState(), c = E.project.clips.find(c => Math.abs(c.start - 12) < 0.01 && c.srcOut - c.srcIn < 0.2)
        const el = document.querySelector('[data-clip="' + c.id + '"]'), b = el.getBoundingClientRect(); return { id: c.id, w: Math.round(b.width * 10) / 10, tiny: el.dataset.tiny, x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } })()`)
      const px = info.x + 11   // outside the 1px sliver, inside the padded grab area
      win.webContents.sendInputEvent({ type: 'mouseMove', x: px, y: info.y })
      win.webContents.sendInputEvent({ type: 'mouseDown', x: px, y: info.y, button: 'left', clickCount: 1 })
      for (let i = 1; i <= 20; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: px + i * 6, y: info.y, button: 'left', modifiers: ['leftbuttondown'] }); await wait(16) }
      win.webContents.sendInputEvent({ type: 'mouseUp', x: px + 120, y: info.y, button: 'left', clickCount: 1 })
      await wait(500)
      const after = await win.webContents.executeJavaScript(`(() => { const c = window.__sv.useEditor.getState().project.clips.find(c => c.id === ${JSON.stringify(info.id)}); return { start: +c.start.toFixed(2) } })()`)
      console.log('TINY_RESULT ' + JSON.stringify({ info, after })); app.quit(); return
    }
    if (process.env.SLOWVERB_MARKHOVER) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_MARKHOVER)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        E.getState().setZoom(60, 0); E.getState().setScroll(0); E.getState().addMarkerAtPlayhead(); E.getState().setPlayhead(12); E.getState().addMarkerAtPlayhead() })()`)
      await wait(800)
      const snap = `(() => { const r = (q) => { const e = document.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.left * 100) / 100, Math.round(b.top * 100) / 100, Math.round(b.width * 100) / 100] }
        const E = window.__sv.useEditor.getState(); return { scrollX: E.scrollX, pps: E.pxPerSec, clip: r('.tl-clip'), playhead: r('.tl-playhead'), lanes: r('.tl-lanes'), ruler: r('.tl-ruler'), markers: [...document.querySelectorAll('.tl-marker')].map(m => { const b = m.getBoundingClientRect(); return [Math.round(b.left * 100) / 100, Math.round(b.top * 100) / 100] }) } })()`
      const before = await win.webContents.executeJavaScript(snap)
      const pos = await win.webContents.executeJavaScript(`(() => { const m = document.querySelectorAll('.tl-marker')[1]; const b = m.querySelector('i').getBoundingClientRect(); return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) } })()`)
      win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x - 30, y: pos.y })
      await wait(100)
      const samples: unknown[] = []
      for (let i = 0; i <= 12; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x - 30 + i * 5, y: pos.y }); await wait(50); samples.push(await win.webContents.executeJavaScript(snap)) }
      await wait(300)
      console.log('MARKHOVER_RESULT ' + JSON.stringify({ before, during: samples.map((x) => JSON.stringify(x)).filter((v, i, a) => a.indexOf(v) === i).length, first: samples[0], last: samples[samples.length - 1] }))
      app.quit(); return
    }
    if (process.env.SLOWVERB_GAP) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_GAP)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        for (const t of [45, 100]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        E.getState().select(E.getState().project.clips.filter(c => c.start >= 44 && c.start < 46).map(c => c.id)); E.getState().deleteSelection(false)
        const spans = () => E.getState().project.clips.map(c => [+c.start.toFixed(1), +(c.start + (c.srcOut - c.srcIn)).toFixed(1)])
        out.afterDelete = spans()
        E.getState().setPlayhead(70); E.getState().runCommand('selectAtPlayhead'); out.gap = E.getState().gap && [+E.getState().gap.start.toFixed(1), +E.getState().gap.end.toFixed(1)]
        E.getState().runCommand('delete'); await wait(200); out.afterD = spans(); out.gapAfter = E.getState().gap
        E.getState().undo(); await wait(100); out.afterUndo = spans()
        return out })()`)
      console.log('GAP_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_SYNC) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        const scan = await window.api.scan([${JSON.stringify(process.env.SLOWVERB_SYNC)}])
        sv.useLibrary.getState().replace(scan.map((x, i) => ({ ...x, id: 't' + i })))
        sv.usePlayer.getState().play('t0'); await wait(1500); sv.engine.el.currentTime = 90; await wait(800)
        out.playerBefore = +sv.engine.el.currentTime.toFixed(2); out.playerPlaying = !sv.engine.el.paused
        await E.getState().openSong(scan[0].path)
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        await wait(600)
        out.editorAfterOpen = +E.getState().now().toFixed(2); out.editorPlaying = E.getState().playing; out.playerPausedAfterOpen = sv.engine.el.paused
        E.getState().gotoTime(150); await wait(1200)
        out.editorAt = +E.getState().now().toFixed(2)
        E.getState().close(); await wait(1200)
        out.playerAfterClose = +sv.engine.el.currentTime.toFixed(2); out.playerPlayingAfterClose = !sv.engine.el.paused; out.editorPlayingAfterClose = E.getState().playing
        return out })()`)
      console.log('SYNC_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_DUPDRAG) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_DUPDRAG)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        E.getState().apply(p => window.__sv.ops.addTrack(p)); E.getState().fitToView(1300) })()`)
      await wait(1200)
      const drag = async (dy: number, label: string) => {
        const r = await win.webContents.executeJavaScript(`(() => { const c = document.querySelector('.tl-clip').getBoundingClientRect(); return { x: Math.round(c.left + 300), y: Math.round(c.top + c.height * 0.85) } })()`)
        const m = ['alt'] as ('alt' | 'leftbuttondown')[]
        win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y, modifiers: m })
        win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1, modifiers: m })
        for (let i = 1; i <= 24; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: r.x + i * 2, y: r.y + Math.round(dy * i / 24), button: 'left', modifiers: [...m, 'leftbuttondown'] }); await wait(16) }
        win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x + 48, y: r.y + dy, button: 'left', clickCount: 1, modifiers: m })
        await wait(500)
        return await win.webContents.executeJavaScript(`({ label: ${JSON.stringify(label)}, tracks: window.__sv.useEditor.getState().project.tracks.map(t => t.name), clips: window.__sv.useEditor.getState().project.clips.map(c => [window.__sv.useEditor.getState().project.tracks.findIndex(t => t.id === c.track), +c.start.toFixed(1)]) })`)
      }
      win.webContents.on('console-message', (_e, level, msg) => { if (level >= 2) console.log('RENDERER_ERR ' + msg.slice(0, 300)) })
      const a = await drag(70, 'to existing A2')
      console.log('TOAST_A ' + await win.webContents.executeJavaScript(`JSON.stringify(window.__sv.useEditor.getState().toast)`))
      await win.webContents.executeJavaScript(`window.__sv.useEditor.getState().select([])`)
      const b = await drag(260, 'below last (new track)')
      const img = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
      console.log('DUPDRAG_RESULT ' + JSON.stringify({ a, b })); app.quit(); return
    }
    if (process.env.SLOWVERB_NEWTRACK) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_NEWTRACK)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        E.getState().fitToView(1300) })()`)
      await wait(1200)
      const info = await win.webContents.executeJavaScript(`(() => { const ln = document.querySelector('.tl-lanes'); if (!ln) return { error: 'no .tl-lanes', classes: [...document.querySelectorAll('[class*=tl-]')].slice(0, 12).map(e => e.className) }
        const r = ln.getBoundingClientRect(), clip = document.querySelector('.tl-clip').getBoundingClientRect()
        const x = Math.round(r.left + 300), y = Math.round(clip.bottom + 60)
        return { lanes: [r.left, r.top, r.width, r.height].map(Math.round), clipBottom: Math.round(clip.bottom), x, y, hit: (document.elementFromPoint(x, y) || {}).className, tracks: window.__sv.useEditor.getState().project.tracks.length } })()`)
      if (info.error) { console.log('NEWTRACK_RESULT ' + JSON.stringify(info)); app.quit(); return }
      const mods = ['alt'] as const
      win.webContents.sendInputEvent({ type: 'mouseMove', x: info.x, y: info.y, modifiers: [...mods] })
      win.webContents.sendInputEvent({ type: 'mouseDown', x: info.x, y: info.y, button: 'left', clickCount: 1, modifiers: [...mods] })
      for (let i = 1; i <= 30; i++) { win.webContents.sendInputEvent({ type: 'mouseMove', x: info.x, y: info.y + i * 6, button: 'left', modifiers: [...mods, 'leftbuttondown'] }); await wait(16) }
      const mid = await win.webContents.executeJavaScript(`window.__sv.useEditor.getState().project.tracks.length + ' lanes in DOM: ' + document.querySelectorAll('[data-track]').length`)
      win.webContents.sendInputEvent({ type: 'mouseUp', x: info.x, y: info.y + 180, button: 'left', clickCount: 1, modifiers: [...mods] })
      await wait(500)
      const after = await win.webContents.executeJavaScript(`window.__sv.useEditor.getState().project.tracks.map(t => t.name)`)
      const img = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
      console.log('NEWTRACK_RESULT ' + JSON.stringify({ info, mid, after })); app.quit(); return
    }
    if (process.env.SLOWVERB_PERF) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      const sample = async (secs: number) => {
        const rows: Record<string, number[]> = {}
        for (let i = 0; i < secs; i++) {
          await wait(1000)
          for (const m of app.getAppMetrics()) { const k = m.type + (m.name ? ':' + m.name : ''); (rows[k] ??= []).push(+m.cpu.percentCPUUsage.toFixed(1)) }
        }
        return Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, { avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), max: Math.max(...v) }]))
      }
      const lt = async () => win.webContents.executeJavaScript(`(() => { const l = window.__lt || []; const r = { n: l.length, maxMs: Math.round(Math.max(0, ...l)), totalMs: Math.round(l.reduce((a, b) => a + b, 0)) }; window.__lt = []; return r })()`)
      await win.webContents.executeJavaScript(`(async () => {
        window.__lt = []; try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__lt.push(e.duration))).observe({ entryTypes: ['longtask'] }) } catch (e) {}
        const sv = window.__sv, r = await window.api.scan([${JSON.stringify(process.env.SLOWVERB_DIR)}])
        sv.useLibrary.getState().replace(r.map((x, i) => ({ ...x, id: 't' + i }))); sv.useFx.getState().applyPreset('Slowed + Reverb'); sv.usePlayer.getState().play('t0') })()`)
      await wait(2000); await lt()
      const player = { cpu: await sample(10), longtasks: await lt() }
      await win.webContents.executeJavaScript(`(async () => { const sv = window.__sv; sv.usePlayer.getState().toggle(); await sv.useEditor.getState().openSong(${JSON.stringify(process.env.SLOWVERB_PERF)})
        for (let i = 0; i < 80 && !(sv.useEditor.getState().project && sv.useEditor.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        await sv.useEditor.getState().togglePlay() })()`)
      await wait(2000); await lt()
      const editor = { cpu: await sample(10), longtasks: await lt() }
      console.log('PERF_RESULT ' + JSON.stringify({ player, editor })); app.quit(); return
    }
    if (process.env.SLOWVERB_AUDIOHEALTH) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const out = {}, wait = (ms) => new Promise(r => setTimeout(r, ms))
        for (const hint of ['interactive', 'playback']) {
          const ctx = new AudioContext({ latencyHint: hint }), noise = ctx.createBuffer(2, ctx.sampleRate * 4, ctx.sampleRate)
          for (let c = 0; c < 2; c++) { const d = noise.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = Math.sin(i / 20) * 0.3 }
          const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true
          const conv = ctx.createConvolver(), ir = ctx.createBuffer(2, ctx.sampleRate * 8, ctx.sampleRate)   // heavy 8s reverb: worst case
          for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3 }
          conv.buffer = ir; const g = ctx.createGain(); g.gain.value = 0.0001   // inaudible: we only measure the stream
          src.connect(conv).connect(g).connect(ctx.destination); src.start()
          await ctx.resume(); await wait(9000)
          const st = ctx.playoutStats ? ctx.playoutStats.toJSON() : null
          out[hint] = { rate: ctx.sampleRate, baseLatencyMs: +(ctx.baseLatency * 1000).toFixed(1), outputLatencyMs: +((ctx.outputLatency || 0) * 1000).toFixed(1), stats: st }
          await ctx.close()
        }
        return out })()`)
      console.log('AUDIOHEALTH_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_DRAGPERF) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms))
        await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_DRAGPERF)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        E.getState().fitToView(1300); await wait(800)
        const side = document.querySelector('.tl-fadeside[data-fade="out"]'); if (!side) return { error: 'no side zone' }
        const r0 = side.getBoundingClientRect(), x0 = r0.left + 6, y0 = r0.top + 10
        const frames = []; let on = true, last = performance.now()
        const loop = (t) => { frames.push(t - last); last = t; if (on) requestAnimationFrame(loop) }; requestAnimationFrame(loop)
        side.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: x0, clientY: y0, pointerId: 1, button: 0, buttons: 1, pointerType: 'mouse' }))
        const N = 240, t0 = performance.now()
        for (let i = 1; i <= N; i++) { window.dispatchEvent(new PointerEvent('pointermove', { clientX: x0 - i * 1.2, clientY: y0, pointerId: 1, buttons: 1, pointerType: 'mouse' })); await new Promise(r => setTimeout(r, 4)) }
        window.dispatchEvent(new PointerEvent('pointerup', { clientX: x0 - N * 1.2, clientY: y0, pointerId: 1 }))
        await wait(300); on = false
        const f = frames.slice(2).sort((a, b) => a - b), q = (p) => +f[Math.min(f.length - 1, Math.floor(f.length * p))].toFixed(1)
        const c = E.getState().project.clips[0]
        return { frames: f.length, p50: q(0.5), p95: q(0.95), max: q(0.999), over25ms: f.filter(x => x > 25).length, fadeOut: +c.fadeOut.toFixed(2), ms: Math.round(performance.now() - t0) }
      })()`)
      console.log('DRAGPERF_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_EDUI3) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms)), out = {}
        await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_EDUI3)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        const id = E.getState().project.clips[0].id
        E.getState().select([id]); E.getState().setFadeCurveSel('in', 's'); E.getState().patchSelected({ fadeIn: 4, fadeOut: 6 })
        E.getState().setEnvPointAt(id, 100, 1); E.getState().setEnvPointAt(id, 110, 0.3); E.getState().setEnvPointAt(id, 140, 0.3); E.getState().setEnvPointAt(id, 150, 1)
        E.getState().setRange({ a: 200, b: 240, tracks: null }); E.getState().muteRange()
        await E.getState().detectSectionsToMarkers(); await wait(800)
        E.getState().setTool('range'); E.getState().setRange({ a: 30, b: 70, tracks: null })
        E.getState().fitToView(960); await wait(1000)
        const p = E.getState().project, c = p.clips[0]
        out.clips = p.clips.length; out.env = (c.env || []).map(e => [+e.t.toFixed(1), +e.g.toFixed(2)]); out.fade = [c.fadeIn, c.fadeInCurve, c.fadeOut]
        out.markers = p.markers.map(m => +m.t.toFixed(1))
        E.getState().undo(); E.getState().undo(); await wait(200); out.afterUndo = E.getState().project.markers.length
        return out })()`)
      const img = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
      console.log('EDUI3_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_EDUI) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms))
        if (${JSON.stringify(process.env.SLOWVERB_PRESET || '')}) sv.useFx.getState().applyPreset(${JSON.stringify(process.env.SLOWVERB_PRESET || '')})
        await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_EDUI)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await wait(100)
        const out = { clips0: E.getState().project.clips.length }
        for (const t of [45, 100, 160, 220]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        const mid = E.getState().project.clips.filter(c => c.start >= 99 && c.start < 101)
        E.getState().select(mid.map(c => c.id)); E.getState().deleteSelection(false)
        E.getState().setPlayhead(75); E.getState().select([])
        E.getState().fitToView(960)
        await wait(1200)
        const p = E.getState().project
        out.clips1 = p.clips.map(c => [+c.start.toFixed(1), +c.srcIn.toFixed(1), +c.srcOut.toFixed(1)])
        E.getState().undo(); await wait(100); out.afterUndo = E.getState().project.clips.length
        E.getState().redo(); await wait(600); out.afterRedo = E.getState().project.clips.length
        E.getState().resetToOriginal(); await wait(200); out.afterReset = E.getState().project.clips.length; E.getState().undo(); await wait(200); out.afterResetUndo = E.getState().project.clips.length; E.getState().redo(); await wait(200)
        if (${process.env.SLOWVERB_RENDER ? 'true' : 'false'}) { await E.getState().renderToLibrary(); await wait(800); out.files = (await window.api.sync()).files }
        out.tab = document.body.innerText.slice(0, 80).replace(/\\n/g, ' | ')
        return out })()`)
      const img = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
      console.log('EDUI_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_SRCBIN) {
      // Editor library browser: open a song in the editor, show the LIBRARY tab, add another song as a new track, screenshot. Needs SLOWVERB_ROOT with >= 2 songs.
      const js3 = (code: string) => win.webContents.executeJavaScript(`(async () => { const sv = window.__sv, w = (ms) => new Promise(r => setTimeout(r, ms)); ${code} })()`)
      await js3(`await sv.usePlaylists.getState().refresh(); await w(800); const ts = sv.useLibrary.getState().tracks; await sv.useEditor.getState().openSong(ts[0].path); await w(1500); sv.useEditor.getState().setDock('source'); await w(700)`)
      writeFileSync(process.env.SLOWVERB_SHOT!.replace('.png', '-1.png'), (await win.webContents.capturePage()).toPNG())
      const r = await js3(`const ed = sv.useEditor.getState(), ts = sv.useLibrary.getState().tracks; document.querySelectorAll('.dk-song')[1].click(); await w(900); const before = ed.project.tracks.length; [...document.querySelectorAll('.dk-btns .chip')].find(b => b.textContent === 'NEW TRACK').click(); await w(1500); const p = sv.useEditor.getState().project; return { before, after: p.tracks.length, clips: p.clips.map(c => c.src.split('/').pop() + '@' + c.track) }`)
      writeFileSync(process.env.SLOWVERB_SHOT!.replace('.png', '-2.png'), (await win.webContents.capturePage()).toPNG())
      console.log('SRCBIN_RESULT ' + JSON.stringify(r)); app.quit(); return
    }
    if (process.env.SLOWVERB_LIB) {
      // Library redesign: migration result, the add popup (real clicks on the real DOM), playlists, move-keeps-membership. SLOWVERB_DIR = folder with new1.wav new2.wav to add.
      const { readdirSync, statSync } = await import('fs'), { join, relative } = await import('path')
      const ls = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === '.DS_Store' ? [] : e.isDirectory() ? ls(join(d, e.name)).map((x) => join(e.name, x)) : [e.name]))
      const root = process.env.SLOWVERB_ROOT!, out: Record<string, unknown> = { disk0: ls(root).filter((x) => !x.includes('backup-')) }
      const shot = async (n: string) => { console.log('LIB shot', n); await new Promise((r) => setTimeout(r, 450)); writeFileSync(process.env.SLOWVERB_SHOT!.replace('.png', '-' + n + '.png'), (await win.webContents.capturePage()).toPNG()) }
      const js2 = (code: string) => win.webContents.executeJavaScript(`(async () => { const sv = window.__sv; ${code} })()`)
      console.log('LIB migrate-check'); out.afterMigrate = await js2(`await new Promise(r => setTimeout(r, 600)); return { tracks: sv.useLibrary.getState().tracks.map(t => t.path.slice(sv.usePlaylists.getState().root.length + 1)), lists: sv.useLists.getState().lists.map(l => [l.name, l.songs]), folders: sv.usePlaylists.getState().folders }`)
      await shot('1-files')
      await js2(`sv.useLists.getState().setMode('lists'); const L = sv.useLists.getState(); if (L.lists[0]) L.selectList(L.lists[0].id)`); await shot('2-lists')
      await js2(`sv.useLists.getState().setMode('files')`)
      const src = process.env.SLOWVERB_DIR!
      await js2(`window.__pop = sv.placeFiles([${JSON.stringify(src + '/new1.wav')}, ${JSON.stringify(src + '/new2.wav')}], '2 files', [])`)
      await shot('3-popup')
      out.popup = await js2(`const cats = [...document.querySelectorAll('.ap-cats button')].map(b => b.textContent); document.querySelectorAll('.ap-cats button')[1].click()
        await new Promise(r => setTimeout(r, 200)); const lists = [...document.querySelectorAll('.ap-list .ap-nm')].map(b => b.textContent)
        document.querySelector('.ap-list')?.click()
        const inp = document.querySelector('.ap-new'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, 'Rain'); inp.dispatchEvent(new Event('input', { bubbles: true }))
        await new Promise(r => setTimeout(r, 150)); return { cats, lists } `)
      await shot('4-popup-filled')
      await js2(`const q = document.querySelector('.ap-q'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(q, 'Skepta'); q.dispatchEvent(new Event('input', { bubbles: true })); await new Promise(r => setTimeout(r, 150))`); await shot('3b-artist')
      await js2(`document.querySelectorAll('.ap-alist .ap-list')[1].click(); await new Promise(r => setTimeout(r, 150))`)
      await js2(`document.querySelector('.ap-go').click(); await window.__pop; await new Promise(r => setTimeout(r, 700))`)
      out.afterAdd = await js2(`return { tracks: sv.useLibrary.getState().tracks.map(t => t.path.slice(sv.usePlaylists.getState().root.length + 1)), lists: sv.useLists.getState().lists.map(l => [l.name, l.songs]) }`)
      // move a song that is in a playlist to the other home: membership must follow
      out.moved = await js2(`const T = sv.useLibrary.getState().tracks.find(t => t.path.includes('new1')); await sv.usePlaylists.getState().moveTrack(T.id, 'Songs'); await new Promise(r => setTimeout(r, 700))
        return { path: sv.useLibrary.getState().tracks.find(t => t.id === T.id).path.slice(sv.usePlaylists.getState().root.length + 1), lists: sv.useLists.getState().lists.map(l => [l.name, l.songs]) }`)
      await js2(`sv.useLists.getState().setMode('lists'); const L = sv.useLists.getState(); L.selectList(L.lists.find(l => l.name === 'Rain').id)`)
      { const r = await js2(`const b = document.querySelector('.more').getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }`) as { x: number; y: number }
        const wc = win.webContents; wc.sendInputEvent({ type: 'mouseMove', x: r.x, y: r.y }); wc.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); wc.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 })
        await new Promise((q) => setTimeout(q, 400)); out.moreClick = await js2(`const m = document.querySelector('.song-menu'); return m ? m.getBoundingClientRect().toJSON() : null`); await new Promise((q) => setTimeout(q, 600)); out.moreLater = await js2(`const m = document.querySelector('.song-menu'); if (!m) return null; const r = m.getBoundingClientRect(), e = document.elementFromPoint(r.x + 40, r.y + 40), cs = getComputedStyle(m); return { top: e && e.className, tag: e && e.tagName, pos: cs.position, z: cs.zIndex, vis: cs.visibility, anim: cs.animationName, inner: [innerWidth, innerHeight], r: [r.x, r.y, r.width, r.height], parent: m.parentElement.className }`); await shot('6-more') }
      await js2(`document.querySelector('.item').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 220 }))`); await shot('5-menu')
      out.disk1 = ls(root).filter((x) => !x.includes('backup-')); out.mig = statSync(join(root, '.slowverb', 'migrated.json')).size > 0
      void relative
      console.log('LIB_RESULT ' + JSON.stringify(out)); app.quit(); return
    }
    if (process.env.SLOWVERB_PL) {
      const pl = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, P = sv.usePlaylists, out = {}
        await P.getState().refresh(); out.start = { folders: P.getState().folders, tracks: sv.useLibrary.getState().tracks.length }
        await P.getState().create('', 'Focus'); await P.getState().create('Focus', 'Deep')
        const src = ${JSON.stringify(process.env.SLOWVERB_DIR + '/Neon Rain.wav')}
        const added = await P.getState().importFiles([src], 'Focus'); out.imported = added.map(t => t.path)
        await P.getState().moveTrack(added[0].id, 'Gym'); out.movedTo = sv.useLibrary.getState().tracks.find(t => t.id === added[0].id).path
        await P.getState().rename('Chill', 'Calm'); P.getState().select('Gym')
        await new Promise(r => setTimeout(r, 600)); out.end = { folders: P.getState().folders, counts: sv.useLibrary.getState().tracks.length }
        return out })()`)
      await new Promise((r) => setTimeout(r, 900))
      const img = await win.webContents.capturePage(); writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
      console.log('PL_RESULT ' + JSON.stringify(pl)); app.quit(); return
    }
    const result = await win.webContents.executeJavaScript(js)
    if (process.env.SLOWVERB_FAKE_PROGRESS) { win.webContents.send('dl:progress', { stage: 'Downloading', pct: 42, item: { i: 2, n: 5 } }); await new Promise((r) => setTimeout(r, 1500)) }
    if (process.env.SLOWVERB_RECTS) console.log('RECTS ' + JSON.stringify(await win.webContents.executeJavaScript(`(() => { const o = { win: [innerWidth, innerHeight, devicePixelRatio] }; for (const s of ['.app', '.main', '.main .panel', '.side', '.drag']) o[s] = [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map((v) => +v.toFixed(1)) }); return o })()`)))
    const img = await win.webContents.capturePage()
    writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
    console.log('SHOT_RESULT ' + JSON.stringify(result))
    app.quit()
  })
}

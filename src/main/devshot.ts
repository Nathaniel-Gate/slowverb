import { BrowserWindow, app } from 'electron'
import { writeFileSync } from 'fs'

/** Test harness: SLOWVERB_SHOT=out.png SLOWVERB_DIR=folder. Loads the folder like a drop, plays with a preset,
 *  proves sound reaches the output, saves a screenshot, prints JSON, quits. Not used in normal runs. */
export function runShot(win: BrowserWindow) {
  // Safety: editor tests write sidecar files and renders next to the songs, so they must never run on the real library.
  if ((process.env.SLOWVERB_EDUI || process.env.SLOWVERB_EDUI3 || process.env.SLOWVERB_DRAGPERF || process.env.SLOWVERB_AUDIOHEALTH || process.env.SLOWVERB_PERF || process.env.SLOWVERB_NEWTRACK || process.env.SLOWVERB_DUPDRAG || process.env.SLOWVERB_SYNC || process.env.SLOWVERB_GAP || process.env.SLOWVERB_MARKHOVER || process.env.SLOWVERB_TINY || process.env.SLOWVERB_BOUNCE || process.env.SLOWVERB_PLAYEDIT || process.env.SLOWVERB_CLICKEDITOR || process.env.SLOWVERB_SAVECLOSE || process.env.SLOWVERB_TRACKFX || process.env.SLOWVERB_LOOP || process.env.SLOWVERB_TIDY || process.env.SLOWVERB_AUTOPLAY || process.env.SLOWVERB_DETACHKEY || process.env.SLOWVERB_SCRUB || process.env.SLOWVERB_ED || process.env.SLOWVERB_PL) && !process.env.SLOWVERB_ROOT) { console.error('Refusing: set SLOWVERB_ROOT to a temp folder'); app.quit(); return }
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
    if (process.env.SLOWVERB_DETACHKEY) {
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      await win.webContents.executeJavaScript(`(async () => { const E = window.__sv.useEditor; await E.getState().openSong(${JSON.stringify(process.env.SLOWVERB_DETACHKEY)})
        for (let i = 0; i < 80 && !(E.getState().project && E.getState().buffers.size); i++) await new Promise(r => setTimeout(r, 100))
        for (const t of [10, 12]) { E.getState().setPlayhead(t); E.getState().splitAtPlayhead() }
        const mid = E.getState().project.clips.find(c => Math.abs(c.start - 10) < 0.01)
        E.getState().select([mid.id]); E.getState().makeLoopFromSelection(4, 0.05)
        E.getState().select(E.getState().project.clips.filter(c => c.loop).map(c => c.id)) })()`)
      await wait(500)
      const snap = `(() => { const p = window.__sv.useEditor.getState().project; return { count: p.loops && p.loops[0] && p.loops[0].count, tagged: p.clips.filter(c => c.loop).length, plainAfter10: p.clips.filter(c => !c.loop && c.start >= 10 && c.start < 20).length, sel: window.__sv.useEditor.getState().selection.length, open: window.__sv.useEditor.getState().open, focus: document.activeElement && document.activeElement.tagName } })()`
      const before = await win.webContents.executeJavaScript(snap)
      win.webContents.focus()
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'D', modifiers: ['alt', 'shift'] })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'D', modifiers: ['alt', 'shift'] })
      await wait(500)
      const after = await win.webContents.executeJavaScript(snap)
      const toast = await win.webContents.executeJavaScript(`JSON.stringify(window.__sv.useEditor.getState().toast)`)
      console.log('DETACHKEY_RESULT ' + JSON.stringify({ before, after, toast })); app.quit(); return
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
    const img = await win.webContents.capturePage()
    writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
    console.log('SHOT_RESULT ' + JSON.stringify(result))
    app.quit()
  })
}

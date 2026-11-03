import { BrowserWindow, app } from 'electron'
import { writeFileSync } from 'fs'

/** Test harness: SLOWVERB_SHOT=out.png SLOWVERB_DIR=folder. Loads the folder like a drop, plays with a preset,
 *  proves sound reaches the output, saves a screenshot, prints JSON, quits. Not used in normal runs. */
export function runShot(win: BrowserWindow) {
  // Safety: editor tests write sidecar files and renders next to the songs, so they must never run on the real library.
  if ((process.env.SLOWVERB_EDUI || process.env.SLOWVERB_ED || process.env.SLOWVERB_PL) && !process.env.SLOWVERB_ROOT) { console.error('Refusing: set SLOWVERB_ROOT to a temp folder'); app.quit(); return }
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
    if (process.env.SLOWVERB_EDUI) {
      const r = await win.webContents.executeJavaScript(`(async () => {
        const sv = window.__sv, E = sv.useEditor, wait = (ms) => new Promise(r => setTimeout(r, ms))
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

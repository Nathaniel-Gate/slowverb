import { BrowserWindow, app } from 'electron'
import { writeFileSync } from 'fs'

/** Test harness: SLOWVERB_SHOT=out.png SLOWVERB_DIR=folder. Loads the folder like a drop, plays with a preset,
 *  proves sound reaches the output, saves a screenshot, prints JSON, quits. Not used in normal runs. */
export function runShot(win: BrowserWindow) {
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
      e.currentTime = 10; await new Promise(r => setTimeout(r, 300))
      return { seekedTo: e.currentTime, duration: e.duration, seekable: e.seekable.length && e.seekable.end(0), tracks: r.length, rate: e.playbackRate, preservesPitch: e.preservesPitch, time: e.currentTime, paused: e.paused, peak, error: e.error && e.error.message }
    })()`
    const result = await win.webContents.executeJavaScript(js)
    const img = await win.webContents.capturePage()
    writeFileSync(process.env.SLOWVERB_SHOT!, img.toPNG())
    console.log('SHOT_RESULT ' + JSON.stringify(result))
    app.quit()
  })
}

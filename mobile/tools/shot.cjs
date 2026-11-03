// Screenshot a URL in a 390x844 Electron window (the phone reference size).
// Usage: cd ~/Projects/slowverb && node_modules/.bin/electron mobile/tools/shot.cjs <url> <out.png> [step...]
// Steps run in order before the shot: a CSS selector = click it; "wait:500" = pause; "js:<code>" = run in the page; "scroll@<sel>@<px>" = scroll an element.
const { app, BrowserWindow, session } = require('electron')
const fs = require('fs'), path = require('path')

const [url, out, ...steps] = process.argv.slice(2)
if (!url || !out) { console.error('usage: electron shot.cjs <url> <out.png> [click-selector | wait:ms | js:code | scroll:sel:px]...'); process.exit(2) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

app.whenReady().then(async () => {
  // Fresh in-memory profile each run so IndexedDB never carries songs between shots.
  const ses = session.fromPartition('shot-' + Date.now())
  const win = new BrowserWindow({ width: 390, height: 844, useContentSize: true, show: false, frame: false, backgroundColor: '#0a0a0a',
    webPreferences: { session: ses, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } })
  const logs = []
  win.webContents.on('console-message', (e, level, msg) => { const lv = e.level ?? level, m = e.message ?? msg; if ((lv === 'error' || lv >= 3) && !m.includes('Security Warning')) logs.push(m) })
  win.webContents.on('render-process-gone', (_e, d) => { console.error('renderer gone', d.reason); app.exit(1) })
  await win.loadURL(url)
  await sleep(1500)
  for (const s of steps) {
    if (s.startsWith('wait:')) await sleep(+s.slice(5))
    else if (s.startsWith('js:')) console.log('js ->', JSON.stringify(await win.webContents.executeJavaScript(s.slice(3))))
    else if (s.startsWith('drag@') || s.startsWith('hold@')) {
      // drag@<sel>@<dx> swipes horizontally from the element centre; hold@<sel>@<ms> presses and holds.
      const [kind, sel, n] = s.split('@')
      const r = await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`)
      const ev = (type, x) => win.webContents.sendInputEvent({ type, x, y: r.y, button: 'left', clickCount: 1 })
      ev('mouseDown', r.x)
      if (kind === 'hold') await sleep(+n)
      else for (let i = 1; i <= 8; i++) { ev('mouseMove', r.x + (+n * i) / 8); await sleep(20) }
      ev('mouseUp', r.x + (kind === 'drag' ? +n : 0))
    }
    else if (s.startsWith('scroll@')) { const [, sel, px] = s.split('@'); await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(sel)}).scrollTop=${+px}`) }
    else {
      // Real mouse events at the element's centre, so pointer-event gestures (rows, sliders) behave like a finger tap.
      const r = await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector(${JSON.stringify(s)});if(!e)return null;e.scrollIntoView({block:'nearest'});const b=e.getBoundingClientRect();return{x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)}})()`)
      if (!r) { console.error('selector not found:', s) }
      else { win.webContents.sendInputEvent({ type: 'mouseDown', x: r.x, y: r.y, button: 'left', clickCount: 1 }); await sleep(40); win.webContents.sendInputEvent({ type: 'mouseUp', x: r.x, y: r.y, button: 'left', clickCount: 1 }) }
    }
    await sleep(700)
  }
  const img = await win.webContents.capturePage()
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true })
  fs.writeFileSync(out, img.toPNG())
  const size = img.getSize()
  console.log('saved', out, size.width + 'x' + size.height, logs.length ? 'console errors: ' + logs.join(' | ') : 'no console errors')
  app.quit()
})

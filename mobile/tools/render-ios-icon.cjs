// Renders tools/ios-icon.svg to an opaque 1024x1024 PNG (iOS applies its own rounded mask). Run from the repo root: node_modules/.bin/electron mobile/tools/render-ios-icon.cjs <out.png>
const { app, BrowserWindow } = require('electron'), fs = require('fs'), path = require('path')
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'ios-icon.svg'), 'utf8')
  const w = new BrowserWindow({ width: 1024, height: 1024, show: false, frame: false, useContentSize: true })
  await w.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:#0b0b0b">${svg}</body>`))
  await new Promise((r) => setTimeout(r, 400))
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  fs.writeFileSync(process.argv[2], img.resize({ width: 1024, height: 1024 }).toPNG()); app.quit()
})

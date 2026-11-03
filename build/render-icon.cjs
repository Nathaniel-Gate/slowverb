// Renders build/icon.svg -> build/icon.png (1024) -> build/icon.icns. Run: npx electron build/render-icon.cjs
const { app, BrowserWindow } = require('electron'), fs = require('fs'), path = require('path'), { execSync } = require('child_process')
app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8')
  const w = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, useContentSize: true})
  await w.loadURL('data:text/html,' + encodeURIComponent(`<body style="margin:0;background:transparent">${svg}</body>`))
  await new Promise((r) => setTimeout(r, 500))
  const img = await w.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const png = path.join(__dirname, 'icon.png'); fs.writeFileSync(png, img.resize({ width: 1024, height: 1024 }).toPNG())
  const set = path.join(__dirname, 'icon.iconset'); fs.rmSync(set, { recursive: true, force: true }); fs.mkdirSync(set)
  for (const s of [16, 32, 128, 256, 512]) for (const x of [1, 2]) execSync(`sips -z ${s * x} ${s * x} "${png}" --out "${set}/icon_${s}x${s}${x === 2 ? '@2x' : ''}.png"`, { stdio: 'ignore' })
  execSync(`iconutil -c icns "${set}" -o "${path.join(__dirname, 'icon.icns')}"`)
  fs.rmSync(set, { recursive: true, force: true }); app.quit()
})

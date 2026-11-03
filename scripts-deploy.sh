#!/bin/zsh
# Build the .app, install it to ~/Applications and relaunch it. The OLD copy is always fully stopped first (a copy that is still
# running would just be re-focused by the single-instance lock and keep running the old code).
set -e
cd "$(dirname "$0")"
npm test --silent && npx electron-vite build && npx electron-builder --mac --dir -c.mac.identity=null
APP=$(ls -d dist/mac*/Slowverb.app | head -1)
osascript -e 'tell application "Slowverb" to quit' 2>/dev/null || true
for i in {1..24}; do pgrep -f "Applications/Slowverb.app/Contents/MacOS/Slowverb" >/dev/null || break; sleep 0.5; done
pkill -f "Applications/Slowverb.app/Contents/MacOS/Slowverb" 2>/dev/null || true; sleep 1
mkdir -p $HOME/Applications && rm -rf $HOME/Applications/Slowverb.app && cp -R "$APP" $HOME/Applications/Slowverb.app
xattr -cr $HOME/Applications/Slowverb.app 2>/dev/null || true
open $HOME/Applications/Slowverb.app
echo "Installed and relaunched ~/Applications/Slowverb.app"

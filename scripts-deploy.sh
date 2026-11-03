#!/bin/zsh
# Build the .app and install it to $HOME/Applications.
set -e
cd "$(dirname "$0")"
npm test --silent && npx electron-vite build && npx electron-builder --mac --dir -c.mac.identity=null
APP=$(ls -d dist/mac*/Slowverb.app | head -1)
rm -rf $HOME/Applications/Slowverb.app 2>/dev/null || true
mkdir -p $HOME/Applications && cp -R "$APP" $HOME/Applications/Slowverb.app
echo "Installed $HOME/Applications/Slowverb.app"

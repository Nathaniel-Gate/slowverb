# Slowverb

A Mac music player and editor for slowed and reverb versions of songs. Drop audio in, pick a speed and reverb, edit each song on a timeline, download audio from a link, and send songs to your iPhone.

## Run it
Needs macOS and Node 20 or newer.

```
npm install
npm run dev      # run with live reload
npm test         # unit tests
npm run dist     # build the Mac app into dist/
```

Downloading from links uses `yt-dlp` (install it with `pip install yt-dlp` or from its site). Songs live in `~/Music/Slowverb/Songs` and `Sound bites`; playlists are lists that can hold any song.

`CLAUDE.md` is the map of the code. The `mobile/` folder is the iPhone app (Capacitor, needs Xcode).

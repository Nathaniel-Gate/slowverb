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

## Clips tab
Cut pictures and video to a song: PLAYER | EDITOR | CLIPS. Same timeline tools as the editor; the song plays as the clock and the preview follows it. Media lives in `~/Music/Slowverb/Visuals/` (drop files on the tab, paste a picture/video link, or paste a Pinterest board and press SYNC PINTEREST). Private boards use your Chrome login: the first sync asks macOS once for "Chrome Safe Storage" (click Always Allow). Preview only for now, no video export.

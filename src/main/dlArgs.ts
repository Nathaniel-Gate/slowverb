// Pure command-line builders for the Clips tab's downloaders (no electron, no processes: unit-tested on their own).

/** yt-dlp VIDEO mode. This Mac has no ffmpeg, so nothing that needs joining is asked for: first `b` (picture + sound already in
 *  one file; H.264 mp4 up to 1080p first, which Chromium plays), and when a site only has separate streams (YouTube today) the
 *  best picture-only stream. Clips are pictures-only by default, so that is all the Clips tab needs. */
export const VIDEO_FORMAT = 'b[ext=mp4][vcodec^=avc1][height<=1080]/b[ext=mp4][height<=1080]/b[height<=1080]/bv[ext=mp4][vcodec^=avc1][height<=1080]/bv[ext=mp4][height<=1080]/bv[height<=1080]/b'
export const NO_SOUND = 'SVACODEC=none'   // printed by yt-dlp when the file it kept has no sound
export function ytVideoArgs(url: string, dir: string, o: { retries: string; socketTimeout: string }): string[] {
  return ['--no-mtime', '--ignore-errors', '--retries', o.retries, '--socket-timeout', o.socketTimeout,
    '--no-playlist', '--playlist-items', '1', '-f', VIDEO_FORMAT, '-o', `${dir}/%(title).150B.%(ext)s`,
    '--newline', '--print', 'after_move:SVACODEC=%(acodec)s', '--print', 'after_move:filepath', '--', url]
}
/** Plain-English reason for a failed video download (yt-dlp's last ERROR line in, a sentence out). */
export function videoError(err: string): string {
  const last = err.split('\n').filter((l) => l.includes('ERROR')).pop()?.replace(/^.*ERROR:\s*/, '') ?? ''
  if (/requested format is not available|ffmpeg/i.test(last)) return 'This site only offers the picture and the sound as separate files, which need ffmpeg to join. Install ffmpeg (brew install ffmpeg) or try another link.'
  if (/sign in|login|private|members/i.test(last)) return 'That video needs a login, so it cannot be downloaded here.'
  if (/unsupported url/i.test(last)) return 'That site is not supported for video downloads.'
  if (/HTTP Error 403|forbidden/i.test(last)) return 'The site refused the download (403). Try again later or another link.'
  return last || 'Video download failed'
}

/** gallery-dl for Pinterest. `-d` = Visuals folder (gallery-dl adds pinterest/<user>/<board>), an archive file makes re-syncs
 *  fetch only new pins (and lets a cancelled sync resume), a short pause between requests keeps it gentle. Pin videos are
 *  skipped (they are streaming playlists that need ffmpeg). Chrome cookies ONLY when private boards are switched on. */
export function galleryArgs(url: string, o: { dest: string; archive: string; cookies: boolean; sleep?: number }): string[] {
  return ['-d', o.dest, '--download-archive', o.archive, '--sleep-request', String(o.sleep ?? 0.4),
    '-o', 'extractor.pinterest.videos=false', ...(o.cookies ? ['--cookies-from-browser', 'chrome'] : []), '--', url]
}
/** Plain-English reason for a failed Pinterest sync. */
export function galleryError(err: string, cookies: boolean): string {
  if (/keyring|safe storage|decrypt|cookies.*chrome|chrome.*cookies|Could not find/i.test(err) && cookies) return 'Could not read your Pinterest login from Chrome (macOS did not allow it, or Chrome is not signed in). Switch off PRIVATE BOARDS for public boards, or allow it and try again.'
  if (/401|403|login|unauthori[sz]ed|private/i.test(err)) return cookies ? 'Pinterest refused: that board may be private to someone else, or your Chrome login has expired.' : 'That board looks private. Switch on PRIVATE BOARDS to use your Chrome login.'
  if (/404|not found|no such|NotFoundError/i.test(err)) return 'Pinterest says that board or pin does not exist. Check the link.'
  if (/getaddrinfo|network|timed out|connection/i.test(err)) return 'No connection to Pinterest. Check the internet and retry.'
  const last = err.split('\n').map((l) => l.trim()).filter(Boolean).pop()
  return last ? `Pinterest sync failed: ${last.replace(/^\[[^\]]+\]\[error\]\s*/, '')}` : 'Pinterest sync failed'
}
/** Paths gallery-dl reports: downloaded files are printed as absolute paths inside the destination; skipped ones start with "# ".
 *  Anything else (warnings that happen to start with a path) is ignored. */
export const galleryFile = (line: string, dest: string): string | null => {
  const l = line.trim()
  return l.startsWith(dest.replace(/\/$/, '') + '/') && /\.(jpe?g|png|gif|webp|avif|bmp|mp4|mov|m4v|webm)$/i.test(l) ? l : null
}

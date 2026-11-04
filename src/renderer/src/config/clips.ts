// Clips tab (pictures and video cut to the song). Every tunable lives here.
import type { Aspect, VisualFit } from '../editor/model'

export const CLIPS = {
  stillSourceSec: 3600,        // nominal length of a still picture's "source", so a still clip can be stretched up to an hour
  stillInSec: 1800,            // a new still starts mid-source: both ends have handles to extend or crossfade into
  stillSec: 4,                 // default length of a still dropped on the timeline when the song has no BPM
  stillBeats: 4,               // with a BPM: one bar
  videoFallbackSec: 5,         // when a video's length cannot be read
  defaultFit: 'cover' as VisualFit,
  aspects: ['16:9', '9:16', '1:1', '4:3'] as Aspect[],
  defaultAspect: '16:9' as Aspect,
  zoomMax: 0.5, zoomStep: 0.01,                // push-in: 0.5 = ends 50% bigger
  // preview stage
  stageBg: '#000000',
  stageMaxDpr: 2,
  imageCacheMax: 48,           // decoded pictures kept in memory (least recently used dropped first)
  driftSec: 0.15,              // a playing video further than this from where it should be is re-seeked
  trimFromSec: 0.02, trimGain: 0.8, trimMax: 0.08,   // smaller drifts: play up to 8% slower/faster until back in step (no jump)
  seekToleranceSec: 0.04,      // a paused video closer than this to its frame is not re-seeked
  videoPoolMax: 8,             // most <video> elements kept alive at once
  preloadSec: 1.5,             // start loading a video this long before its clip begins
  // timeline
  audioLaneH: 48,              // px, the read-only song lane at the top of the Clips timeline (2 grid units)
  thumbTileW: 64,              // px, width of one thumbnail tile on a clip (height = lane height)
  filmstripFrames: 8,          // frames grabbed from a video for its timeline filmstrip
  frameJpegQ: 0.72,
  grabTimeoutMs: 8000,         // give up on a filmstrip frame after this long (broken or very slow video)
  // media dock
  gridThumbPx: 96,             // media browser tile size (4 grid units)
  privateBoardsDefault: true,  // NG approved reading private boards with his Chrome login
  keychainHint: 'The first private-board sync asks macOS once for "Chrome Safe Storage". Click Always Allow so Slowverb can read your Pinterest login from Chrome. Nothing else is read.',
  keychainShort: 'Private boards use your Chrome login. The first sync asks macOS once for "Chrome Safe Storage": click Always Allow.'
}

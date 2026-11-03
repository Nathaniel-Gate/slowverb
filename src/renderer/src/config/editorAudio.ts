// Editor audio tunables. Change a number here, the editor audio follows.
export type FadeCurve = 'lin' | 'pow' | 'log' | 's'   // same union as Clip.fadeInCurve/fadeOutCurve in editor/model.ts
/** Track EQ: low shelf, one peaking mid band, high shelf. dB range and corner frequencies. */
export const TRACK_EQ = { lowHz: 120, midHz: 1000, midQ: 0.9, highHz: 6000, minDb: -12, maxDb: 12 }
export const TRACK_REVERB = { decayMin: 0.3, decayMax: 8, defaultWet: 0.25, defaultDecay: 2.2, defaultDamping: 0.4 }
export const EDITOR_AUDIO = {
  fadeCurve: 'pow' as FadeCurve, // default for clips without a curve: equal power keeps a crossfade's loudness steady (uncorrelated material); 'lin' dips in the middle
  logFadeDb: 60,          // 'log' fade: gain rises like a straight line in dB over this many dB (ends are pinned to exact 0 and 1)
  curvePoints: 128,       // samples in each fade automation curve
  smoothCutSec: 0.003,    // Project.smoothCuts: micro-fade length on every clip boundary (not at the file's own start/end or inside a contiguous split)
  microCurvePoints: 16,   // samples in a micro-fade curve (it is only a few ms long)
  contiguousEps: 1e-6,    // seconds: two clips this close (timeline and source) count as one unbroken stretch of audio
  naturalEdgeEps: 5e-4,   // seconds: a clip edge this close to the start/end of its source file is the file's own edge, never micro-faded
  minFadeSec: 0.0005,     // fade windows shorter than this are skipped
  declick: 0.01,          // seconds: ramp used when stopping/seeking live playback
  loopDeclick: 0.003,     // seconds: tiny ramp at each loop seam (hides the jump from b back to a)
  loopLead: 0.25,         // seconds before a loop ends that the next pass is scheduled (sample-accurate seam)
  startLead: 0.03,        // seconds between "play" and the first sample, so scheduling is never late
  endSlack: 0.05,         // seconds after the end before the "ended" callback fires
  peakLevels: [64, 256, 1024, 4096], // samples per peak bucket (each level is built from the previous one)
  defaultRate: 44100,     // render rate when a project has no sources
  channels: 2,
  minSpeed: 0.05,         // guards division by a zero/negative master speed
  // shuttle (J/K/L) and scrub
  shuttleMax: 8,          // |rate| clamp; negative = reverse
  shuttleMin: 0.1,        // |rate| below this is clamped up (use pause to stop)
  scrubGrain: 0.09,       // seconds of audio per scrub grain
  scrubFadeIn: 0.006, scrubFadeOut: 0.02, // seconds, envelope of a grain
  scrubMinInterval: 0.025, // seconds: scrub calls closer together than this are ignored
  scrubMinMove: 0.02,      // seconds: the playhead must move at least this far to fire another grain
  scrubRepeatGuard: 0.35,  // seconds: within this long after a grain, a grain at (nearly) the same spot is never replayed
  // render
  defaultBitDepth: 16 as 16 | 24 | 32,
  normalizeDb: -1,        // renderProject({ normalize: true }) scales the peak to this dBFS
  // analysis (normalise button)
  silenceDb: -120,        // reported for digital silence (never -Infinity, so it survives JSON)
  maxGainDb: 24,          // gainToTarget never boosts more than this
  lufsBlockSec: 0.4, lufsStepSec: 0.1, lufsAbsGate: -70, lufsRelGate: -10,
  // meter
  meterFallDbPerSec: 30,  // bar release speed (the reading is linear 0..1; the UI maps it to dB)
  meterHoldSec: 1.2,      // peak hold before it falls
  meterClipHoldSec: 3,    // clip light stays lit this long after the last clipped sample
  meterFft: 1024,         // analyser window (about 23ms at 44.1k: reading every frame sees every sample)
  // bpm
  bpmMin: 70, bpmMax: 180, // detected tempo is folded into this range
  bpmHop: 256,            // samples per onset-envelope frame (after downmix)
  bpmCandidates: 5,       // tempo candidates from the autocorrelation stage that get a full beat-train check
  bpmAnalyseSec: 100,     // seconds from the start of the song analysed
  bpmPriorCenter: 120, bpmPriorOctaves: 1.4, // mild preference for common tempos (octave-error guard)
  bpmTapReset: 2.5,       // seconds: a longer gap between taps starts a new tap run
  // sections (detectSections / detectSilence / leadingTrailingSilence)
  sectionBinSec: 0.5,     // feature resolution: frames are averaged into bins this long
  sectionKernelSec: 8,    // half-width of the checkerboard novelty kernel (longer = only big changes, fewer boundaries)
  sectionMinSec: 8,       // default minimum distance between two boundaries
  sectionThreshold: 2,    // a boundary's novelty must exceed mean + threshold x (1 - sensitivity) x std of the novelty curve (sensitivity 0..1, default 0.5)
  sectionFloor: [3, 0.3, 0.3, 0.3, 0.3], // smallest std per feature (rms dB, low/mid/high log10 energy, log2 centroid): drift below this is not a change, so steady audio stays boundary-free
  sectionEdgeSec: 4,      // no boundary closer than this to the file's start or end (the kernel needs context on both sides)
  sectionMinNovelty: 0.05, // absolute floor on a boundary's novelty (a full change scores near 1; steady audio scores under 0.01)
  sectionSensitivity: 0.5, // default sensitivity (higher = more boundaries)
  sectionFrameSec: 0.0464, // analysis window (rounded to a power of two samples)
  sectionBands: [250, 2000], // Hz edges between the low / mid / high energy bands
  sectionMaxSec: 900,     // only the first 15 minutes are analysed (keeps a long file fast)
  silenceWinSec: 0.005    // detectSilence measures RMS in windows this long
}

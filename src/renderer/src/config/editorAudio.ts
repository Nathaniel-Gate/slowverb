// Editor audio tunables. Change a number here, the editor audio follows.
export type FadeCurve = 'equalPower' | 'linear'
export const EDITOR_AUDIO = {
  fadeCurve: 'equalPower' as FadeCurve, // equal power keeps a crossfade's loudness steady (uncorrelated material); linear dips in the middle
  curvePoints: 128,       // samples in each fade automation curve
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
  bpmTapReset: 2.5        // seconds: a longer gap between taps starts a new tap run
}

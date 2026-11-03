// Editor audio tunables. Change a number here, the editor audio follows.
export type FadeCurve = 'equalPower' | 'linear'
export const EDITOR_AUDIO = {
  fadeCurve: 'equalPower' as FadeCurve, // equal power keeps a crossfade's loudness steady; linear dips in the middle
  curvePoints: 128,       // samples in each fade automation curve
  minFadeSec: 0.0005,     // fade windows shorter than this are skipped
  declick: 0.01,          // seconds: ramp used when stopping/seeking live playback
  startLead: 0.03,        // seconds between "play" and the first sample, so scheduling is never late
  endSlack: 0.05,         // seconds after the end before the "ended" callback fires
  peakLevels: [64, 256, 1024, 4096], // samples per peak bucket (each level is built from the previous one)
  defaultRate: 44100,     // render rate when a project has no sources
  channels: 2,
  minSpeed: 0.05          // guards division by a zero/negative master speed
}

// Output stream tuning (reverted to the original 'interactive' after a report that 'playback' sounded worse; try 'playback' or 0.2 if a Bluetooth speaker breaks up).
// Output stream tuning. Bluetooth speakers have large, uneven buffers, so the default tiny "interactive" buffer can underrun
// and glitch. 'playback' asks the OS for a bigger buffer (more stable, ~tens of ms more delay). Set 'interactive' for lowest latency,
// or a number of seconds (e.g. 0.2) for an exact buffer.
export const OUTPUT: { latencyHint: AudioContextLatencyCategory | number } = { latencyHint: 'interactive' }

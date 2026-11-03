// Timeline view tunables. Every pixel size, threshold and zoom limit lives here.
export const TL = {
  rulerH: 30,            // px, ruler height (D1's TrackHeaders should leave this much space above the first header)
  laneH: 84,             // px, height of one track lane (TrackHeaders must use the same value)
  clipPadY: 4,           // px, gap above/below a clip inside its lane
  edgePx: 9,             // px, width of a trim handle (capped at a third of the clip width, see timeline.css)
  dragStartPx: 3,        // px the pointer must travel before a click becomes a drag
  snapThresholdPx: 9,    // px, snap magnetism
  minPps: 0.5,           // px per second, furthest zoom out
  maxPps: 4000,          // px per second, furthest zoom in
  zoomStep: 1.6,         // factor per click with the zoom tool
  zoomWheelK: 0.0125,    // exp(-deltaY * k) per wheel/pinch tick
  scrollTailViewFrac: 0.5, // scroll may run this fraction of a viewport past the end of the project
  followMarginFrac: 0.1, // while playing, page the view so the playhead lands this far from the left edge
  followPlayhead: true,
  minTickPx: 96,         // px, smallest gap between labelled ruler ticks
  wheelLineScale: 16,    // px per line when deltaMode is lines
  markerLabelMax: 14,    // characters of a marker name shown on the ruler
  fadeShade: 0.34,       // alpha of the area removed by a fade
  gainClampDb: 12,       // waveform scale clamp when drawing a clip with gain
  dimMuted: 0.38,        // clip opacity on muted / non-soloed tracks
  autoScrollZonePx: 44,  // px from the left/right edge where a drag starts scrolling the view
  autoScrollMax: 24,     // px per frame at the very edge
  scrubSnap: true,       // snap the playhead to edit points while scrubbing the ruler
  syncAttr: 'data-sync-scroll-y', // elements with this attribute get scrollTop mirrored from the lanes (TrackHeaders scroller)
  scrollYEvent: 'editor:scroll-y' // window CustomEvent<{ top: number }> fired when the lanes scroll vertically
}

// Ruler tick table: [step in seconds, subdivisions drawn between labelled ticks]
export const TICK_STEPS: [number, number][] = [
  [0.001, 5], [0.002, 4], [0.005, 5], [0.01, 5], [0.02, 4], [0.05, 5], [0.1, 5], [0.2, 4], [0.5, 5],
  [1, 4], [2, 4], [5, 5], [10, 5], [15, 3], [30, 6], [60, 4], [120, 4], [300, 5], [600, 5], [1800, 6], [3600, 4]
]

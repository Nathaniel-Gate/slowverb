// Timeline view tunables. Every pixel size, threshold and zoom limit lives here.
export const TL = {
  rulerH: 30,            // px, ruler height (D1's TrackHeaders should leave this much space above the first header)
  laneH: 84,             // px, height of one track lane (TrackHeaders must use the same value)
  clipPadY: 4,           // px, gap above/below a clip inside its lane
  edgePx: 9,             // px, width of a trim handle (capped at a third of the clip width, see timeline.css)
  dragSmooth: 0.4,       // 0..1 how fast fade/gain/envelope drags glide to the pointer each frame (1 = no smoothing)
  dragSmoothEps: 0.0005, // seconds: stop animating when this close to the pointer
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
  scrollYEvent: 'editor:scroll-y', // window CustomEvent<{ top: number }> fired when the lanes scroll vertically

  // wave 2 (agent H)
  laneMinH: 38, laneMaxH: 280, collapsedH: 26,   // px: per-track height limits (Track.height / Track.collapsed)
  detailMinH: 46,        // px: clips shorter than this hide fade handles and the gain band
  fadeHandlePx: 10,      // px, size of the fade handle square
  gainMinDb: -36, gainMaxDb: 12, gainPadTop: 20, gainPadBottom: 8, // gain band: dB range mapped onto the clip height (minus padding)
  gainHitPx: 7,          // px each side of the gain line that grabs it
  gainFine: 0.12,        // Alt = fine: pointer movement multiplier
  followMode: 'glide' as 'glide' | 'page' | 'off', // while playing: glide (animated page turn), page (instant), off
  glideMs: 260, zoomGlideMs: 190,
  hoverTipMs: 520,       // hover this long over a clip for the start/length/gain tooltip
  flashMs: 420,          // razor cut flash
  cutHitPx: 11,          // px: how close the pointer must be to a cut for the rolling-edit tool
  beatMinPx: 6,          // px: hide beat lines closer together than this
  beatBarEvery: 4,       // every Nth beat is drawn stronger
  dropGhostSec: 6,       // width of the ghost clip while dragging a source over the lanes (real length unknown until drop)
  autoScrollY: 16,       // px per frame at the top/bottom edge while dragging across tracks
  rangeGripPx: 7,        // px: grab width of the In/Out brackets on the ruler
  markerDragPx: 3,
  miniH: 34, miniMinViewSec: 0.05, miniPad: 0.06,     // minimap bar height, narrowest viewport, empty tail fraction
  zoomSliderSteps: 1000,
  tcFrameDecimals: 3,    // decimals in the typed/displayed timecode (m:ss.mmm)

  // wave 3 (agent H2): Resolve-style fades, volume rubber band, range tool
  fadeDotPx: 9,          // px, diameter of the always-visible fade dot on each top corner
  fadeDotY: 8,           // px from the clip top to the dot centre
  fadeDotInset: 8,       // px: a dot never sits closer than this to the clip side (so a zero fade still shows a dot)
  fadeSidePx: 15,        // px, width of the side drag zone (drag inward from the clip side to fade)
  fadeZoneFrac: 0.58,    // the side zone covers the top part of the clip side; the trim handle keeps the rest
  fadeFullPx: 10,        // px: dragging a fade this close to the opposite side snaps to a full mute
  fadeShapeSteps: 32,    // samples used to draw a curved fade
  fadeMinSideW: 40,      // px: clips narrower than this get no side zone
  envHitPx: 7,           // px each side of the envelope line that grabs it
  envPointPx: 5,         // px, radius of an envelope point
  envPointHitPx: 9,      // px, grab radius of an envelope point
  envMinGapSec: 0.002,   // envelope points keep at least this much time between them
  envMaxGain: 16,        // upper limit of one envelope point's multiplier
  rangeHandlePx: 9,      // px, grab width of a range side handle
  rangeMinSec: 0.01,     // shortest range
  rangeGainStepDb: 1,    // toolbar Gain -/+ step
  rangeBarW: 420,        // px, approximate mini toolbar width (used to keep it inside the view)
  rangeBarH: 26,         // px, mini toolbar height
  rangeBarBelowMaxH: 200, // px: a range shorter than this gets its toolbar below it when there is no room above
  rangeBarGap: 6         // px between the range top and the toolbar
}

export type ToolId = 'select' | 'razor' | 'ripple' | 'slip' | 'hand' | 'zoom' | 'roll' | 'rate' | 'trackfwd' | 'range'

// Label colours (Clip.label / Marker.color are these keys). Muted so the greyscale look stays calm.
export const LABELS: { key: string; name: string; color: string }[] = [
  { key: 'none', name: 'None', color: '' },
  { key: 'blue', name: 'Blue', color: '#7d97bd' },
  { key: 'teal', name: 'Teal', color: '#6fa9a3' },
  { key: 'sage', name: 'Sage', color: '#8fae82' },
  { key: 'sand', name: 'Sand', color: '#c4a76c' },
  { key: 'rose', name: 'Rose', color: '#c08585' },
  { key: 'violet', name: 'Violet', color: '#a08cc0' },
  { key: 'stone', name: 'Stone', color: '#b2aea2' }
]
export const labelColor = (key?: string): string => LABELS.find(l => l.key === key)?.color ?? ''
// Track stripe colours, picked by track index.
export const TRACK_COLORS = ['#7d97bd', '#6fa9a3', '#8fae82', '#c4a76c', '#c08585', '#a08cc0', '#b2aea2']
export const trackColor = (i: number) => TRACK_COLORS[((i % TRACK_COLORS.length) + TRACK_COLORS.length) % TRACK_COLORS.length]

// Ruler tick table: [step in seconds, subdivisions drawn between labelled ticks]
export const TICK_STEPS: [number, number][] = [
  [0.001, 5], [0.002, 4], [0.005, 5], [0.01, 5], [0.02, 4], [0.05, 5], [0.1, 5], [0.2, 4], [0.5, 5],
  [1, 4], [2, 4], [5, 5], [10, 5], [15, 3], [30, 6], [60, 4], [120, 4], [300, 5], [600, 5], [1800, 6], [3600, 4]
]

// Fade curve choices for the curve popover (ids match Clip.fadeInCurve / fadeOutCurve).
export const FADE_CURVES: { id: 'lin' | 'pow' | 'log' | 's'; label: string }[] = [
  { id: 'lin', label: 'Linear' }, { id: 'pow', label: 'Equal power' }, { id: 'log', label: 'Log' }, { id: 's', label: 'S curve' }
]

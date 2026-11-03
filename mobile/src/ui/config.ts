// UI tunables for the phone shell. Change a number here, the whole UI follows.
export const UI = {
  longPressMs: 450,        // hold a song row this long to open its action sheet
  swipeReveal: 144,        // px the row slides left to show EDIT / DELETE
  swipeSlop: 8,            // px of movement before a touch counts as a swipe/scroll
  skipSeconds: 15,         // transport skip back / forward
  toastMs: 2600,           // how long "+3 ADDED" stays
  tag: { minWet: 0.01 }    // reverb counts as "on" in a row tag above this mix
}

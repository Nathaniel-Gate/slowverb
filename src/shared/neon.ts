// Per-song neon colour, shared by the Mac app and the phone app (pure: no DOM, no stores).

/** Only colours that look good lit up: cyan, orange, hot pink, turquoise, yellow, electric blue, amber, sky, spring green.
 *  No yellow-green, purple or pure red. Edit the list to taste. */
export const NEONS = ['#00f0ff', '#ff7a1a', '#ff2d95', '#00ffd0', '#ffe600', '#3d7bff', '#ffa21a', '#2db7ff', '#00ff9d', '#ff3d7f', '#19e6ff', '#ffd000']

export const neonHash = (key: string) => {
  let h = 2166136261
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619)
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16   // final mix so similar names still land far apart
  return h >>> 0
}
/** Index into NEONS for a song key (the same key always gives the same index). No key: 0. */
export const neonIndex = (key: string | null | undefined) => (key ? neonHash(key) % NEONS.length : 0)
export const neonFor = (key: string | null | undefined) => NEONS[neonIndex(key)]

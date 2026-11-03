import type { Fx } from '../../../shared/types'
import { DEFAULT_FX } from '../config/fx'
import type { Project } from './model'

/** The whole-mix Version (speed + reverb) the editor plays and renders with.
 *  project.master = an Fx: explicit mix set in the Mix panel.  null (the default) = FOLLOW the player's version for this song,
 *  so the editor sounds exactly like the player view (slowed, reverbed) until you choose otherwise. */
let fallback: (p: Project) => Fx = () => DEFAULT_FX
export const setMasterFallback = (f: (p: Project) => Fx) => { fallback = f }
export const masterOf = (p: Project): Fx => p.master ?? fallback(p)

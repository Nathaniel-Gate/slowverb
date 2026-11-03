import { create } from 'zustand'
import type { RangeSel } from '../storeTypes'

// The range while it is being drawn or resized (uncommitted). RangeLayer shows it instead of the store's range;
// the store gets setRange once, on release. Same idea as laneLive.ts.
export const useRangeLive = create<{ draft: RangeSel | null }>(() => ({ draft: null }))

import { useEffect } from 'react'
import { SHORTCUTS } from '../../config/shortcuts'
import { useFx } from '../fx/fx.store'
import { usePlayer } from './player.store'

export function useShortcuts() {
  useEffect(() => {
    const run = {
      toggle: () => usePlayer.getState().toggle(), next: () => usePlayer.getState().next(1), prev: () => usePlayer.getState().next(-1),
      bypass: () => useFx.getState().toggleBypass(), back5: () => usePlayer.getState().skip(-5), fwd5: () => usePlayer.getState().skip(5)
    }
    const key = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'text') return
      const hit = SHORTCUTS.find((s) => s.code === e.code && !!s.meta === e.metaKey)
      if (hit) { e.preventDefault(); run[hit.action]() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
}

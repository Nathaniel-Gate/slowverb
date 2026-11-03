import { useState } from 'react'
import { effectiveFx, useFx } from '../fx/fx.store'
import { usePlayer } from '../player/player.store'
import { renderCurrentWav, slug } from './renderCurrent'

export function ExportButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle')
  const fx = useFx((s) => effectiveFx(s)), cur = usePlayer((s) => s.cur)
  const locked = fx.pitchLock
  const run = async () => {
    setState('busy')
    try {
      const r = await renderCurrentWav(); if (!r) return setState('idle')
      const ok = await window.api.exportAudio(`${r.title} (${r.edited ? 'edit ' : ''}${slug(fx)}).wav`, r.wav)
      setState(ok ? 'saved' : 'idle')
    } catch (e) { console.error('[export]', e); setState('error') }
    setTimeout(() => setState('idle'), 2500)
  }
  return (
    <button className="ghost" disabled={!cur || locked || state === 'busy'} onClick={run} title={locked ? 'Turn pitch lock off to export' : 'Save this version as a WAV file'}>
      {state === 'busy' ? 'RENDERING…' : state === 'saved' ? 'SAVED' : state === 'error' ? 'FAILED' : locked ? 'EXPORT (PITCH LOCK ON)' : 'EXPORT WAV'}
    </button>
  )
}

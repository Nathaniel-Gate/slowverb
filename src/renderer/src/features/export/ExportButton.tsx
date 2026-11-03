import { useState } from 'react'
import { encodeWav } from '../../audio/wav'
import { renderVersion } from '../../audio/offline'
import { effectiveFx, useFx } from '../fx/fx.store'
import { useLibrary } from '../library/library.store'
import { usePlayer } from '../player/player.store'

const slug = (fx: { speed: number; wet: number }) => [fx.speed !== 1 && `${fx.speed.toFixed(2)}x`, fx.wet > 0 && 'reverb'].filter(Boolean).join('-') || 'original'

export function ExportButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'saved' | 'error'>('idle')
  const fx = useFx((s) => effectiveFx(s)), cur = usePlayer((s) => s.cur)
  const locked = fx.pitchLock
  const run = async () => {
    const t = useLibrary.getState().tracks.find((x) => x.id === cur); if (!t) return
    setState('busy')
    try {
      const { channels, rate } = await renderVersion(t.path, fx)
      const ok = await window.api.exportAudio(`${t.title} (${slug(fx)}).wav`, encodeWav(channels, rate))
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

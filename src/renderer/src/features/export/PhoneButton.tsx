import { useState } from 'react'
import { effectiveFx, useFx } from '../fx/fx.store'
import { usePlayer } from '../player/player.store'
import { renderCurrentWav, slug } from './renderCurrent'

/** Renders the current version (or edit) to AAC and drops it in iCloud Drive > Slowverb Phone, ready to play in the Files app on the iPhone. */
export function PhoneButton() {
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle'), [msg, setMsg] = useState('')
  const fx = useFx((s) => effectiveFx(s)), cur = usePlayer((s) => s.cur), locked = fx.pitchLock
  const run = async () => {
    setState('busy'); setMsg('')
    try {
      const r = await renderCurrentWav(); if (!r) return setState('idle')
      await window.api.sendToPhone(r.rel, `${r.title} (${r.edited ? 'edit ' : ''}${slug(fx)})`, r.wav)
      setState('sent')
    } catch (e) { console.error('[phone]', e); setMsg(e instanceof Error ? e.message : 'Failed'); setState('error') }
    setTimeout(() => setState('idle'), 4000)
  }
  return (
    <button className="ghost" disabled={!cur || locked || state === 'busy'} onClick={run}
      title={state === 'error' ? msg : locked ? 'Turn pitch lock off to send' : 'Put a copy in iCloud Drive > Slowverb Phone so it shows up in Files on your iPhone'}>
      {state === 'busy' ? 'SENDING…' : state === 'sent' ? 'SENT: OPEN FILES ON YOUR PHONE' : state === 'error' ? 'FAILED' : 'SEND TO PHONE'}
    </button>
  )
}

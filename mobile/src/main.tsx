import { createRoot } from 'react-dom/client'
import '@app/theme/tokens.css'
import '@app/theme/blueprint.css'
import '@app/theme/motion.css'
import '@app/features/fx/fx.css'
import './styles/index.css'
import { App } from './App'

async function boot() {
  if (import.meta.env.DEV) {
    const q = new URLSearchParams(location.search)
    // ?safe=1 pretends to be a notched iPhone (47px top, 34px bottom) so safe-area handling can be checked in a desktop browser.
    if (q.get('safe')) { const r = document.documentElement.style; r.setProperty('--sat', '47px'); r.setProperty('--sab', '34px') }
    if (q.get('demo')) await (await import('./ui/dev/demo')).seedDemo()
  }
  createRoot(document.getElementById('root')!).render(<App />)
}
boot()

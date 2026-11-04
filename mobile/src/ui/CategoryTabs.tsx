import { CATEGORIES } from '@shared/config'
import { useNav } from '../state/nav.store'

/** SONGS / SOUND BITES / WHITE NOISE: the three fixed homes. The selected one is a thin neon line + text, never a filled block. */
export function CategoryTabs() {
  const { category, setCategory } = useNav()
  return (
    <div className="cats" role="tablist" aria-label="Category">
      {CATEGORIES.map((c) => (
        <button key={c} role="tab" aria-selected={c === category} className={`cat ${c === category ? 'on' : ''}`} onClick={() => setCategory(c)}>{c}</button>
      ))}
    </div>
  )
}

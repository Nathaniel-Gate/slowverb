import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from '../editor.store'

/** One-line feedback bar at the bottom centre. Slides up on first show; a new message just swaps the text (no re-flash on slider drags). */
export function Toast() {
  const toast = useEditor((s) => s.toast), [shown, setShown] = useState<string | null>(null), [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (toast) { setShown(toast.text); setLeaving(false); return }
    setLeaving(true); const id = window.setTimeout(() => setShown(null), 200); return () => clearTimeout(id)
  }, [toast])
  if (shown === null) return null
  return createPortal(<div className={`ed-toast mono ${leaving ? 'leaving' : ''}`} role="status" aria-live="polite">{shown}</div>, document.body)
}

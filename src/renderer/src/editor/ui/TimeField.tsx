import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../editor.store'
import { editorTransport } from '../transport'
import { formatTimecode, parseTime } from './timelineMath'

/** Playhead timecode (m:ss.mmm). Click to type a time (1:23.5, 83, 1:02:03) and press Enter to jump there. */
export function TimeField() {
  const ref = useRef<HTMLButtonElement>(null)
  const playing = useEditor(s => s.playing), playhead = useEditor(s => s.playhead)
  const [typing, setTyping] = useState(false), [bad, setBad] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el || typing) return
    if (!playing) { el.textContent = formatTimecode(playhead); return }
    let raf = 0
    const loop = () => { el.textContent = formatTimecode(editorTransport.position()); raf = requestAnimationFrame(loop) }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing, playhead, typing])
  if (typing) {
    const done = (v: string) => {
      const t = parseTime(v)
      if (t === null) return setBad(b => b + 1)
      setTyping(false); useEditor.getState().gotoTime(t)
    }
    return (
      <input key={bad} autoFocus className="tl-tc-in mono" data-bad={bad ? '' : undefined} defaultValue={formatTimecode(useEditor.getState().now())} spellCheck={false}
        aria-label="Go to time" onFocus={e => e.currentTarget.select()} onBlur={() => setTyping(false)}
        onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') done(e.currentTarget.value); if (e.key === 'Escape') setTyping(false) }} />
    )
  }
  return <button ref={ref} className="tl-tc mono" title="Click to type a time" onClick={() => setTyping(true)} onPointerUp={e => e.currentTarget.blur()}>0:00.000</button>
}

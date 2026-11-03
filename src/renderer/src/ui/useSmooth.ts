import { useEffect, useRef, useState } from 'react'
/** Eases a displayed value toward a target every frame, so progress glides instead of jumping and
 *  never moves backwards. Returns 0..100. */
export function useSmooth(target: number | null, active: boolean, speed = 0.1) {
  const [v, setV] = useState(0), cur = useRef(0), tgt = useRef(0)
  tgt.current = target ?? tgt.current
  useEffect(() => {
    if (!active) { cur.current = 0; tgt.current = 0; setV(0); return }
    let raf = 0
    const tick = () => {
      const d = tgt.current - cur.current
      cur.current += Math.abs(d) < 0.05 ? d : d * speed
      setV(cur.current); raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [active, speed])
  return v
}

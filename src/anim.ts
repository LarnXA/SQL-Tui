import { useEffect, useRef, useState } from "react"

/** 平滑补间一个数值（高亮/光标位置动画用）。target 改变时从当前值缓动到新值。 */
export function useTween(target: number, duration = 130): number {
  const [val, setVal] = useState(target)
  const valRef = useRef(target)
  useEffect(() => {
    const from = valRef.current
    if (from === target) return
    const start = Date.now()
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - start) / duration)
      const eased = 1 - (1 - t) * (1 - t) // outQuad
      const v = from + (target - from) * eased
      valRef.current = v
      setVal(v)
      if (t >= 1) {
        valRef.current = target
        setVal(target)
        clearInterval(id)
      }
    }, 16)
    return () => clearInterval(id)
  }, [target, duration])
  return val
}

/** 光标/高亮闪烁。 */
export function useBlink(intervalMs = 530): boolean {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const id = setInterval(() => setOn((o) => !o), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return on
}

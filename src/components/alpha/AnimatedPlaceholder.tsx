import { useEffect, useState } from 'react'

const PHRASES = [
  'Restore my website...',
  'Edit my videos...',
  'Fix my backend...',
  'My automation stopped...',
]

const CYCLE_MS = 3000
const FADE_MS = 400

export default function AnimatedPlaceholder() {
  const [index, setIndex] = useState(0)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false)
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % PHRASES.length)
        setVisible(true)
      }, FADE_MS)
    }, CYCLE_MS)
    return () => clearInterval(interval)
  }, [])

  return (
    <span
      className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-white/25 transition-all duration-400 select-none"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(-50%)' : 'translateY(calc(-50% - 6px))',
      }}
    >
      {PHRASES[index]}
    </span>
  )
}

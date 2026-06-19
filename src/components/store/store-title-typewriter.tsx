'use client'

import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

const STORE_TITLE = 'Vacly Store'
const CHAR_DELAY = 0.07

export function StoreTitleTypewriter({ className }: { className?: string }) {
  const cursorDelay = STORE_TITLE.length * CHAR_DELAY + 0.1

  return (
    <h1
      className={cn('inline-flex items-center font-bold tracking-tight text-[#1B2A41]', className)}
      aria-label={STORE_TITLE}
    >
      {STORE_TITLE.split('').map((char, index) => (
        <motion.span
          key={`${index}-${char}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.16,
            delay: index * CHAR_DELAY,
            ease: [0.22, 1, 0.36, 1],
          }}
          className="inline-block"
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
      <motion.span
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0] }}
        transition={{
          delay: cursorDelay,
          duration: 0.75,
          repeat: Infinity,
          repeatDelay: 0.4,
        }}
        className="ml-0.5 inline-block h-[0.85em] w-[2px] translate-y-[0.05em] rounded-full bg-[#3B9EDE]"
        aria-hidden
      />
    </h1>
  )
}

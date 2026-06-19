'use client'

import { useId, type MouseEvent } from 'react'

function pauseBubble(e: MouseEvent<HTMLElement>) {
  e.currentTarget.style.animationPlayState = 'paused'
}

function resumeBubble(e: MouseEvent<HTMLElement>) {
  e.currentTarget.style.animationPlayState = 'running'
}

const BUBBLES = [
  {
    className:
      'left-[6%] top-[18%] h-10 w-10 bg-[#B0D7F3]/30 bubble-transform-1',
    delay: '2s',
  },
  {
    className:
      'right-[8%] top-[12%] h-14 w-14 bg-[#B0E9D3]/30 bubble-transform-2',
    delay: '4s',
  },
  {
    className:
      'left-[22%] bottom-[20%] h-8 w-8 bg-[#E69558]/20 bubble-transform-3',
    delay: '6s',
  },
  {
    className:
      'right-[18%] bottom-[15%] h-12 w-12 bg-[#88C3ED]/25 bubble-transform-4',
    delay: '3s',
  },
  {
    className:
      'left-[12%] bottom-[8%] h-9 w-9 bg-[#88DFBD]/25 bubble-transform-5',
    delay: '5s',
  },
  {
    className:
      'right-[32%] top-[28%] h-7 w-7 bg-[#F6C667]/30 bubble-transform-6',
    delay: '7s',
  },
] as const

export function StoreHeaderBackground() {
  const uid = useId().replace(/:/g, '')
  const lineGradient1 = `storeLineGradient1-${uid}`
  const lineGradient2 = `storeLineGradient2-${uid}`

  return (
    <>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <svg className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id={lineGradient1} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="30%" stopColor="#3DA2E1" stopOpacity="0.4" />
              <stop offset="70%" stopColor="#41CF8F" stopOpacity="0.4" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
            <linearGradient id={lineGradient2} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="transparent" />
              <stop offset="40%" stopColor="#E69558" stopOpacity="0.4" />
              <stop offset="100%" stopColor="transparent" />
            </linearGradient>
          </defs>

          <path
            d="M-200,60 Q300,45 800,70 Q1200,90 1600,60"
            stroke={`url(#${lineGradient1})`}
            strokeWidth="3"
            fill="none"
            strokeDasharray="100 900"
            className="animate-line-travel"
          />
          <path
            d="M-150,120 Q500,105 900,130 Q1300,150 1700,120"
            stroke={`url(#${lineGradient2})`}
            strokeWidth="2"
            fill="none"
            strokeDasharray="80 720"
            className="animate-line-travel-delayed"
          />
          <path
            d="M-100,90 Q400,75 700,100 Q1000,125 1500,90"
            stroke={`url(#${lineGradient1})`}
            strokeWidth="2"
            fill="none"
            strokeDasharray="60 740"
            className="animate-line-travel-slow"
          />
        </svg>
      </div>

      <div className="absolute inset-0 overflow-hidden">
        {BUBBLES.map((bubble) => (
          <div
            key={bubble.className}
            className={`store-bubble-interactive absolute rounded-full animate-float-bounce cursor-pointer ${bubble.className}`}
            style={{ animationDelay: bubble.delay }}
            onMouseEnter={pauseBubble}
            onMouseLeave={resumeBubble}
          />
        ))}
      </div>
    </>
  )
}

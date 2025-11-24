"use client"

import * as React from "react"
import * as ProgressPrimitive from "@radix-ui/react-progress"

import { cn } from "@/lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    variant?: 'default' | 'gradient' | 'success'
  }
>(({ className, value, variant = 'default', ...props }, ref) => {
  const indicatorClass = {
    default: "bg-primary",
    gradient: "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500",
    success: "bg-gradient-to-r from-green-500 to-emerald-500"
  }[variant]

  return (
    <ProgressPrimitive.Root
      ref={ref}
      className={cn(
        "relative h-2 w-full overflow-hidden rounded-full bg-slate-200/50",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn(
          "h-full w-full flex-1 transition-all duration-500 ease-out",
          indicatorClass,
          value === 100 && "animate-pulse"
        )}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
      {/* Shimmer effect when loading */}
      {value !== undefined && value < 100 && value > 0 && (
        <div 
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer"
          style={{ 
            width: `${value}%`,
            backgroundSize: '200% 100%'
          }}
        />
      )}
    </ProgressPrimitive.Root>
  )
})
Progress.displayName = ProgressPrimitive.Root.displayName

export { Progress }

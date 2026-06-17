'use client'

import { cn } from '@/lib/utils'
import { getPersonInitials } from '@/lib/person-initials'

export type PersonAvatarProps = {
  name?: string | null
  firstName?: string | null
  lastName?: string | null
  imageUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  alt?: string
}

const sizeClasses: Record<NonNullable<PersonAvatarProps['size']>, string> = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
}

export function PersonAvatar({
  name,
  firstName,
  lastName,
  imageUrl,
  size = 'sm',
  className,
  alt,
}: PersonAvatarProps) {
  const initials = getPersonInitials(firstName ?? name, lastName)
  const displayName =
    alt ?? [firstName ?? name, lastName].filter(Boolean).join(' ').trim() || 'Usuario'
  const dim = sizeClasses[size]

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={displayName}
        className={cn(dim, 'shrink-0 rounded-full border border-slate-200/80 object-cover', className)}
      />
    )
  }

  return (
    <div
      className={cn(
        dim,
        'flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#1B2A41] to-[#C6A664] font-semibold text-white',
        className,
      )}
      title={displayName}
      aria-label={displayName}
    >
      {initials}
    </div>
  )
}

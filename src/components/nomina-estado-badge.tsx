import { CheckBadgeIcon, PaperAirplaneIcon } from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'

export type NominaEstado = 'enviada' | 'firmada'

export function getNominaEstado(signed?: boolean | null): NominaEstado {
  return signed ? 'firmada' : 'enviada'
}

const ESTADO_CONFIG: Record<
  NominaEstado,
  { label: string; className: string; Icon: typeof PaperAirplaneIcon }
> = {
  enviada: {
    label: 'Enviada',
    className: 'border-sky-200 bg-sky-50 text-sky-700',
    Icon: PaperAirplaneIcon,
  },
  firmada: {
    label: 'Firmada',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Icon: CheckBadgeIcon,
  },
}

export function NominaEstadoBadge({ signed, className }: { signed?: boolean | null; className?: string }) {
  const estado = getNominaEstado(signed)
  const config = ESTADO_CONFIG[estado]
  const Icon = config.Icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap',
        config.className,
        className,
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  )
}

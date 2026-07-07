/** Tokens visuales alineados con vacly-app Dashboard (gestoría / navy). */

export const DASHBOARD_CARD =
  'overflow-hidden rounded-2xl border border-[#1B2A41]/10 bg-white shadow-sm'

export const DASHBOARD_CARD_HEADER =
  'border-b border-[#1B2A41]/8 bg-gradient-to-r from-[#F6F8FA] via-white to-[#BED9EA]/25 px-4 py-3 sm:px-5 sm:py-3.5'

export const DASHBOARD_EYEBROW =
  'text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5C6B7F]/80'

export const DASHBOARD_TITLE = 'text-base font-semibold text-[#1B2A41] sm:text-lg'

export const DASHBOARD_SUBTITLE = 'text-xs text-[#5C6B7F] leading-relaxed'

export const DASHBOARD_INPUT =
  'rounded-lg border border-[#1B2A41]/12 bg-white px-3 text-sm text-[#1B2A41] shadow-sm placeholder:text-[#5C6B7F]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6A664]/30 focus-visible:border-[#C6A664]/40 disabled:opacity-50'

export const DASHBOARD_INPUT_MD = `h-10 ${DASHBOARD_INPUT}`

export const DASHBOARD_INPUT_LG = `h-11 rounded-xl border border-[#1B2A41]/12 bg-white px-3 text-sm text-[#1B2A41] shadow-sm placeholder:text-[#5C6B7F]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C6A664]/30 focus-visible:border-[#C6A664]/40 disabled:opacity-50`

export const DASHBOARD_PILL_GROUP =
  'inline-flex flex-wrap items-center gap-0.5 rounded-full border border-[#1B2A41]/12 bg-[#F6F8FA]/90 p-0.5'

export function dashboardPillClass(active: boolean): string {
  return active
    ? 'rounded-full px-3 py-1.5 text-xs font-semibold bg-[#1B2A41] text-white shadow-sm transition-colors'
    : 'rounded-full px-3 py-1.5 text-xs font-medium text-[#5C6B7F] transition-colors hover:bg-white hover:text-[#1B2A41]'
}

export const DASHBOARD_ICON_BTN =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#1B2A41] transition-colors hover:bg-white disabled:opacity-50 disabled:pointer-events-none'

export const DASHBOARD_PRIMARY_BTN =
  'inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#1B2A41] bg-[#1B2A41] px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#152036] hover:border-[#152036] disabled:opacity-50 disabled:pointer-events-none'

export const DASHBOARD_OUTLINE_BTN =
  'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-[#1B2A41]/15 bg-white px-3 text-xs font-medium text-[#1B2A41] transition-colors hover:bg-[#F6F8FA] disabled:opacity-50'

export const DASHBOARD_TH = 'text-center p-3 text-xs font-semibold uppercase tracking-wide text-[#5C6B7F]'

export const DASHBOARD_TD = 'text-center p-3 text-sm text-[#5C6B7F]'

export const DASHBOARD_TABLE_HEAD = 'bg-[#F6F8FA]/70'

export const DASHBOARD_ROW =
  'border-t border-[#1B2A41]/8 transition-colors hover:bg-[#F6F8FA]/40'

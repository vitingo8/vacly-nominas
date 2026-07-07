'use client'

import { DASHBOARD_PRIMARY_BTN } from '@/components/admin/dashboard-styles'
import { cn } from '@/lib/utils'
import { BellAlertIcon } from '@heroicons/react/24/outline'

export interface AdminNewNotificationsAlert {
  pendingCount: number
  providersLabel: string
}

function ackStorageKey(companyId: string): string {
  return `vacly_admin_notif_banner_ack:${companyId}`
}

export function getNotificationBannerAckAt(companyId: string): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(ackStorageKey(companyId))
}

export function acknowledgeNotificationBanner(companyId: string): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(ackStorageKey(companyId), new Date().toISOString())
}

/** Muestra banner si hay pendientes no reconocidos desde la última visita con cierre explícito. */
export function shouldShowNotificationBanner(
  companyId: string,
  pendingCount: number,
  latestReceivedAt: string | null,
): boolean {
  if (pendingCount <= 0 || !latestReceivedAt) return false
  const ack = getNotificationBannerAckAt(companyId)
  if (!ack) return true
  return new Date(latestReceivedAt).getTime() > new Date(ack).getTime()
}

interface AdminNewNotificationsBannerProps {
  alert: AdminNewNotificationsAlert | null
  onDismiss: () => void
}

export function AdminNewNotificationsBanner({ alert, onDismiss }: AdminNewNotificationsBannerProps) {
  if (!alert) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#1B2A41]/90 p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="admin-new-notif-title"
    >
      <div className="w-full max-w-lg rounded-2xl border border-[#1B2A41]/10 bg-white shadow-2xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#C6A664]/15">
          <BellAlertIcon className="h-9 w-9 text-[#C6A664]" />
        </div>
        <h2 id="admin-new-notif-title" className="text-xl font-bold text-[#1B2A41] mb-2">
          Notificaciones administrativas pendientes
        </h2>
        <p className="text-sm text-[#5C6B7F] mb-6 leading-relaxed">
          Hay <strong>{alert.pendingCount}</strong> notificación{alert.pendingCount === 1 ? '' : 'es'}{' '}
          pendiente{alert.pendingCount === 1 ? '' : 's'} ante la administración en{' '}
          <strong>{alert.providersLabel}</strong>. Revísalas y comparece cuando corresponda para no perder
          plazos.
        </p>
        <button type="button" className={cn(DASHBOARD_PRIMARY_BTN, 'w-full h-11')} onClick={onDismiss}>
          Entendido, ir a la bandeja
        </button>
      </div>
    </div>
  )
}

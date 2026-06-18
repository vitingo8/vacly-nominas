'use client'

import { Button } from '@/components/ui/button'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import {
  milestoneForDays,
  milestoneLabel,
  normalizeExpiryMilestones,
} from '@/lib/admin-integrations/certificate-vault/cert-expiry-milestones'

export interface CertExpiryAlertItem {
  certId: string
  alias: string
  titular: string
  companyName: string
  validTo: string
  daysToExpiry: number
  milestone: number
}

function dismissStorageKey(certId: string, milestone: number): string {
  return `vacly_cert_expiry_dismissed:${certId}:${milestone}`
}

export function isExpiryAlertDismissed(certId: string, milestone: number): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(dismissStorageKey(certId, milestone)) === '1'
}

export function dismissExpiryAlert(certId: string, milestone: number): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(dismissStorageKey(certId, milestone), '1')
}

export function milestoneForCertDays(
  daysToExpiry: number | null,
  milestones: number[] | null | undefined,
): number | null {
  return milestoneForDays(daysToExpiry, normalizeExpiryMilestones(milestones))
}

interface CertExpiryFullscreenAlertProps {
  alert: CertExpiryAlertItem | null
  onDismiss: () => void
}

export function CertExpiryFullscreenAlert({ alert, onDismiss }: CertExpiryFullscreenAlertProps) {
  if (!alert) return null

  const milestoneText = milestoneLabel(alert.milestone)
  const expiryFormatted = new Date(alert.validTo).toLocaleDateString('es-ES', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-[#1B2A41]/90 p-6"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cert-expiry-alert-title"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl p-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
          <ExclamationTriangleIcon className="h-9 w-9 text-amber-600" />
        </div>
        <h2 id="cert-expiry-alert-title" className="text-xl font-bold text-slate-900 mb-2">
          Certificado próximo a caducar
        </h2>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          El certificado <strong>{alert.alias || alert.titular}</strong>
          {alert.companyName ? ` de ${alert.companyName}` : ''} caduca en{' '}
          <strong>{alert.daysToExpiry} días</strong> ({expiryFormatted}). Has recibido este aviso
          configurado para <strong>{milestoneText}</strong>.
        </p>
        <Button
          type="button"
          className="w-full h-11 bg-[#1B2A41] text-white hover:bg-[#152036]"
          onClick={onDismiss}
        >
          Entendido, cerrar aviso
        </Button>
      </div>
    </div>
  )
}

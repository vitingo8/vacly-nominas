'use client'

import { AdminShell } from '@/components/admin/admin-shell'
import { AffiliationForm } from '@/components/admin/affiliation-form'

export default function AdminTgssTerminatePage() {
  return (
    <AdminShell title="Baja trabajador TGSS" subtitle="Solicitud de baja en afiliación RED (Mensaje AFI — baja)">
      <AffiliationForm
        type="baja"
        title="Baja en Seguridad Social"
        description="Genera el fichero AFI de baja y encola el trámite."
      />
    </AdminShell>
  )
}

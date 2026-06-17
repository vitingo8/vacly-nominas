'use client'

import { AdminShell } from '@/components/admin/admin-shell'
import { AffiliationForm } from '@/components/admin/affiliation-form'

export default function AdminTgssTerminatePage() {
  return (
    <AdminShell>
      <AffiliationForm
        type="baja"
        title="Baja en Seguridad Social"
        description="Genera el fichero AFI de baja y encola el trámite."
      />
    </AdminShell>
  )
}

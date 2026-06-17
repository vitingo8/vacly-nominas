'use client'

import { AdminShell } from '@/components/admin/admin-shell'
import { AffiliationForm } from '@/components/admin/affiliation-form'

export default function AdminTgssChangePage() {
  return (
    <AdminShell>
      <AffiliationForm
        type="variacion"
        title="Variación de datos"
        description="Comunica cambios en la relación laboral o datos de afiliación."
      />
    </AdminShell>
  )
}

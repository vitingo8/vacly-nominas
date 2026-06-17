'use client'

import { AdminShell } from '@/components/admin/admin-shell'
import { AffiliationForm } from '@/components/admin/affiliation-form'

export default function AdminTgssHirePage() {
  return (
    <AdminShell title="Alta trabajador TGSS" subtitle="Solicitud de afiliación RED (Mensaje AFI — alta)">
      <AffiliationForm
        type="alta"
        title="Nueva alta en Seguridad Social"
        description="Genera el fichero AFI de alta y encola el trámite para envío (modo mock o SILTRA)."
      />
    </AdminShell>
  )
}

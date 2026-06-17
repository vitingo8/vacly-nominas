'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { NominaDetailPanel, NominaPdfPanel } from '@/components/nomina-detail-panel'

export interface NominaViewerData {
  id?: string
  nominaId?: string
  period_start?: string
  period_end?: string
  employee?: {
    name?: string
    dni?: string
    nss?: string
    category?: string
    code?: string
  }
  company?: {
    name?: string
    cif?: string
    address?: string
    center_code?: string
  }
  perceptions?: Array<{ code?: string; concept?: string; amount?: number }>
  deductions?: Array<{ code?: string; concept?: string; amount?: number }>
  contributions?: Array<{
    concept?: string
    base?: number
    rate?: number
    employer_contribution?: number
  }>
  base_ss?: number
  net_pay?: number
  gross_salary?: number
  iban?: string
  swift_bic?: string
  cost_empresa?: number
  signed?: boolean
  employee_avatar?: string
}

export interface NominaViewerDocument {
  pdfUrl: string
  pageNumber?: number
  filename?: string
  claudeProcessed?: boolean
  nominaData?: NominaViewerData
}

interface NominaViewerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  document: NominaViewerDocument | null
  defaultTab?: 'resumen' | 'percepciones' | 'deducciones' | 'documento'
}

export function NominaViewerDialog({
  open,
  onOpenChange,
  document,
  defaultTab = 'resumen',
}: NominaViewerDialogProps) {
  const nominaData = document?.nominaData
  const hasProcessedData = document?.claudeProcessed && nominaData
  const nominaId = nominaData?.id || nominaData?.nominaId || ''
  const [activeDefaultTab, setActiveDefaultTab] = useState(defaultTab)

  useEffect(() => {
    if (open) {
      setActiveDefaultTab(defaultTab)
    }
  }, [open, defaultTab, nominaData?.id])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b bg-slate-50">
          <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <DocumentTextIcon className="w-5 h-5 text-white" />
            </div>
            {nominaData?.employee?.name || `Página ${document?.pageNumber ?? ''}`}
          </DialogTitle>
          <DialogDescription>
            {nominaData?.company?.name} • {document?.filename}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto p-6">
          {hasProcessedData && nominaId ? (
            <NominaDetailPanel
              nominaData={nominaData}
              nominaId={nominaId}
              filename={document?.filename}
              hasDocument={!!document?.pdfUrl || !!nominaId}
              defaultTab={activeDefaultTab}
            />
          ) : nominaId ? (
            <NominaDetailPanel
              nominaData={nominaData || {}}
              nominaId={nominaId}
              filename={document?.filename}
              hasDocument
              defaultTab="documento"
            />
          ) : document?.pdfUrl && nominaId ? (
            <NominaPdfPanel nominaId={nominaId} filename={document.filename} />
          ) : document?.pdfUrl ? (
            <NominaPdfPanel pdfUrl={document.pdfUrl} filename={document.filename} />
          ) : (
            <p className="text-center text-slate-500 py-12">No hay datos disponibles para esta nómina.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

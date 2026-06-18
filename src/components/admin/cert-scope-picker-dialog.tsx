'use client'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CertScopePickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  titular: string
  nif: string | null
  onChooseOwn: () => void
  onChoosePortfolio: () => void
  loading?: boolean
}

export function CertScopePickerDialog({
  open,
  onOpenChange,
  titular,
  nif,
  onChooseOwn,
  onChoosePortfolio,
  loading = false,
}: CertScopePickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Clasificar certificado</DialogTitle>
          <DialogDescription>
            No hemos podido enlazar este certificado con una empresa (p. ej. certificado de persona física con DNI).
            Indica si corresponde a tu empresa o a la cartera de clientes.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
          <p className="font-medium text-slate-800">{titular}</p>
          {nif && <p className="text-slate-500 font-mono text-xs mt-1">NIF: {nif}</p>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            className="h-auto py-3 flex flex-col items-start gap-1"
            disabled={loading}
            onClick={onChooseOwn}
          >
            <span className="font-semibold">Mi empresa</span>
            <span className="text-xs text-slate-500 font-normal">Certificado de la empresa logueada</span>
          </Button>
          <Button
            type="button"
            className="h-auto py-3 flex flex-col items-start gap-1 bg-[#1B2A41] text-white hover:bg-[#152036]"
            disabled={loading}
            onClick={onChoosePortfolio}
          >
            <span className="font-semibold">Cartera</span>
            <span className="text-xs text-white/80 font-normal">Certificado de un cliente asociado</span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

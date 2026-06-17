'use client'

import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const DEFAULT_NOMINAS_ORIGIN = 'https://vacly-nominas.vercel.app'

interface WindowsBridgeSetupProps {
  onRetry: () => void
  loading: boolean
}

export function WindowsBridgeSetup({ onRetry, loading }: WindowsBridgeSetupProps) {
  const [copied, setCopied] = useState(false)

  const nominasOrigin = useMemo(() => {
    if (typeof window === 'undefined') return DEFAULT_NOMINAS_ORIGIN
    return window.location.origin || DEFAULT_NOMINAS_ORIGIN
  }, [])

  const installerUrl = `${nominasOrigin}/install-vacly-cert-bridge.ps1`

  const oneLineInstall = `powershell -NoProfile -ExecutionPolicy Bypass -Command "& { $f = Join-Path $env:TEMP 'install-vacly-cert-bridge.ps1'; Invoke-WebRequest '${installerUrl}' -OutFile $f -UseBasicParsing; & $f -NominasOrigin '${nominasOrigin}' }"`

  const copyInstallCommand = async () => {
    try {
      await navigator.clipboard.writeText(oneLineInstall)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <Card className="p-6 border-slate-200 w-full">
      <h2 className="font-semibold text-slate-800 mb-2">Conectar certificados de Windows</h2>
      <p className="text-sm text-slate-600 mb-3 leading-relaxed">
        Los certificados digitales viven en tu PC, no en la nube. Por seguridad, ni Vacly ni Supabase pueden
        leer el almacén de Windows: hace falta un asistente local muy pequeño (como AutoFirma, pero integrado
        en Vacly).
      </p>
      <p className="text-sm text-slate-600 mb-4 leading-relaxed">
        <strong>Solo una vez por equipo:</strong> instala el asistente y se ejecutará en segundo plano al
        iniciar sesión. Después verás tus certificados aquí sin volver a configurar nada.
      </p>

      <div className="flex flex-wrap gap-3 mb-4">
        <Button asChild className="bg-[#1B2A41] text-white hover:bg-[#152036]">
          <a href={installerUrl} download="install-vacly-cert-bridge.ps1">
            Descargar asistente Vacly
          </a>
        </Button>
        <Button type="button" variant="outline" onClick={() => void copyInstallCommand()}>
          {copied ? 'Comando copiado' : 'Copiar instalación rápida'}
        </Button>
        <Button type="button" variant="outline" onClick={onRetry} disabled={loading}>
          {loading ? 'Comprobando…' : 'Ya lo instalé — comprobar'}
        </Button>
      </div>

      <details className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <summary className="cursor-pointer font-medium text-slate-700">Instalación manual (alternativa)</summary>
        <ol className="mt-3 space-y-2 list-decimal list-inside text-xs leading-relaxed">
          <li>Descarga el asistente con el botón de arriba.</li>
          <li>Clic derecho → <strong>Ejecutar con PowerShell</strong> (acepta si Windows pregunta).</li>
          <li>Vuelve aquí y pulsa <strong>Ya lo instalé — comprobar</strong>.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">
          También puedes pegar el comando copiado en PowerShell. No requiere permisos de administrador.
        </p>
      </details>

      <p className="mt-4 text-xs text-slate-500">
        Sin el asistente puedes seguir subiendo archivos <strong>.pfx / .p12</strong> en la pestaña Añadir
        certificado.
      </p>
    </Card>
  )
}

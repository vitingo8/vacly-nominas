'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { activateWindowsBridge } from '@/lib/admin-integrations/certificate-vault/windows-bridge-activate'
import { probeWindowsCertBridge } from '@/lib/admin-integrations/certificate-vault/windows-cert-bridge'

type BridgeStatus = 'checking' | 'connected' | 'needs_one_click' | 'offline'

interface WindowsBridgeBannerProps {
  nominasOrigin: string
  onConnected: () => void
}

export function WindowsBridgeBanner({ nominasOrigin, onConnected }: WindowsBridgeBannerProps) {
  const [status, setStatus] = useState<BridgeStatus>('checking')
  const triedAuto = useRef(false)

  const check = useCallback(async () => {
    setStatus('checking')
    const ok = await probeWindowsCertBridge()
    if (ok) {
      setStatus('connected')
      onConnected()
      return true
    }
    setStatus((s) => (s === 'connected' ? s : 'offline'))
    return false
  }, [onConnected])

  const connect = useCallback(async () => {
    setStatus('checking')
    const result = await activateWindowsBridge(probeWindowsCertBridge, nominasOrigin)
    if (result === 'connected') {
      setStatus('connected')
      onConnected()
      return
    }
    if (result === 'install_downloaded') {
      setStatus('needs_one_click')
      return
    }
    setStatus('offline')
  }, [nominasOrigin, onConnected])

  useEffect(() => {
    if (triedAuto.current) return
    triedAuto.current = true
    void (async () => {
      if (await check()) return
      await connect()
    })()
  }, [check, connect])

  useEffect(() => {
    if (status !== 'needs_one_click' && status !== 'checking') return
    const id = window.setInterval(() => {
      void check()
    }, 2500)
    return () => window.clearInterval(id)
  }, [status, check])

  if (status === 'connected') return null

  if (status === 'needs_one_click') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex flex-wrap items-center justify-between gap-3">
        <p>
          <strong>Un solo paso:</strong> abre el archivo <strong>VaclyCertBridge.bat</strong> que se acaba de
          descargar (doble clic). Vacly detectará tus certificados automáticamente.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => void connect()}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (status === 'checking') {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        Conectando con los certificados de Windows…
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 flex flex-wrap items-center justify-between gap-3">
      <p>No se pudo conectar con Windows. Puedes subir un .pfx en «Añadir certificado».</p>
      <Button type="button" size="sm" className="bg-[#1B2A41] text-white" onClick={() => void connect()}>
        Conectar este PC
      </Button>
    </div>
  )
}

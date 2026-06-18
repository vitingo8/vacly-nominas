'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  activateWindowsBridge,
  downloadWindowsBridgeInstaller,
} from '@/lib/admin-integrations/certificate-vault/windows-bridge-activate'
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
    }, 2000)
    return () => window.clearInterval(id)
  }, [status, check])

  if (status === 'connected') return null

  if (status === 'needs_one_click') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-3">
        <p>
          <strong>Paso necesario:</strong> ejecuta el archivo <strong>VaclyCertBridge.bat</strong> que
          se ha descargado (doble clic en Descargas). La ventana de instalación debe completarse; después
          Vacly detectará tus certificados automáticamente.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => downloadWindowsBridgeInstaller(nominasOrigin)}
          >
            Volver a descargar instalador
          </Button>
          <Button type="button" size="sm" className="bg-[#1B2A41] text-white" onClick={() => void connect()}>
            Reintentar conexión
          </Button>
        </div>
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
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 space-y-3">
      <p>
        No se pudo conectar con el almacén de certificados de Windows. Instala el asistente local o sube
        un .pfx manualmente.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="bg-[#1B2A41] text-white" onClick={() => void connect()}>
          Conectar este PC
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => downloadWindowsBridgeInstaller(nominasOrigin)}
        >
          Descargar instalador
        </Button>
      </div>
    </div>
  )
}

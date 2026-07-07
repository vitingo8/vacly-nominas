'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  activateWindowsBridge,
  downloadWindowsBridgeInstaller,
} from '@/lib/admin-integrations/certificate-vault/windows-bridge-activate'
import { probeWindowsCertBridge } from '@/lib/admin-integrations/certificate-vault/windows-cert-bridge'

type BridgeStatus = 'checking' | 'connected' | 'needs_one_click' | 'offline' | 'browser_blocked'

interface WindowsBridgeBannerProps {
  nominasOrigin: string
  onConnected: () => void
}

/**
 * Detecta si el navegador bloquea las peticiones a la red local (Chrome
 * Local Network Access). Ocurre cuando esta página está embebida en un iframe
 * que no delega el permiso `local-network-access`.
 */
function isLocalNetworkBlockedByPolicy(): boolean {
  if (typeof document === 'undefined') return false
  const doc = document as Document & {
    permissionsPolicy?: { allowsFeature: (feature: string) => boolean }
    featurePolicy?: { allowsFeature: (feature: string) => boolean }
  }
  const policy = doc.permissionsPolicy || doc.featurePolicy
  if (!policy || typeof policy.allowsFeature !== 'function') return false
  try {
    // Solo es concluyente si el navegador conoce la feature y la deniega.
    return policy.allowsFeature('local-network-access') === false && window.self !== window.top
  } catch {
    return false
  }
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
    if (isLocalNetworkBlockedByPolicy()) {
      setStatus('browser_blocked')
      return false
    }
    setStatus((s) => (s === 'connected' ? s : 'offline'))
    return false
  }, [onConnected])

  const connect = useCallback(async () => {
    setStatus('checking')
    if (isLocalNetworkBlockedByPolicy()) {
      setStatus('browser_blocked')
      return
    }
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
    if (status !== 'needs_one_click' && status !== 'checking' && status !== 'browser_blocked') return
    const id = window.setInterval(() => {
      void check()
    }, 2000)
    return () => window.clearInterval(id)
  }, [status, check])

  if (status === 'connected') return null

  if (status === 'browser_blocked') {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-950 space-y-3">
        <p>
          <strong>El navegador está bloqueando el acceso a los certificados de Windows.</strong> Esta
          página está embebida sin el permiso de red local. Abre la gestión de certificados en una
          pestaña propia, o si el problema persiste tras actualizar Vacly, comprueba que Chrome tenga
          permitido el acceso a dispositivos de la red local para este sitio (icono del candado →
          Configuración del sitio).
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="bg-[#1B2A41] text-white"
            onClick={() => window.open(window.location.href, '_blank', 'noopener')}
          >
            Abrir en pestaña nueva
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => void connect()}>
            Reintentar conexión
          </Button>
        </div>
      </div>
    )
  }

  if (status === 'needs_one_click') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 space-y-3">
        <p>
          <strong>El asistente aún no está instalado en este PC.</strong> Ejecuta el archivo{' '}
          <strong>VaclyCertBridge.bat</strong> que se ha descargado (doble clic en Descargas). No
          requiere permisos de administrador; al terminar, Vacly detectará tus certificados
          automáticamente.
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
      <div className="rounded-2xl border border-[#1B2A41]/10 bg-white px-4 py-3 text-sm text-[#5C6B7F] shadow-sm">
        Conectando con los certificados de Windows…
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#1B2A41]/10 bg-white px-4 py-3 text-sm text-[#5C6B7F] shadow-sm">
      <p>
        No se pudo conectar con el almacén de certificados de Windows. Si ya instalaste el asistente,
        pulsa «Conectar este PC» para arrancarlo; si es la primera vez, descarga el instalador (no
        requiere administrador). También puedes subir un .pfx manualmente.
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

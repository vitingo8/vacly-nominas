/** Protocolo Windows registrado por el instalador de Vacly. */
export const VACLY_BRIDGE_PROTOCOL = 'vacly-bridge://start'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function downloadWindowsBridgeInstaller(nominasOrigin: string) {
  const base = nominasOrigin.replace(/\/$/, '')
  const a = document.createElement('a')
  a.href = `${base}/api/windows-bridge/install?origin=${encodeURIComponent(base)}`
  a.download = 'VaclyCertBridge.bat'
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Intenta abrir el handler nativo vacly-bridge:// (PowerShell oculto si ya está instalado). */
export function invokeBridgeProtocol() {
  try {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'display:none;width:0;height:0;border:0'
    iframe.src = VACLY_BRIDGE_PROTOCOL
    document.body.appendChild(iframe)
    window.setTimeout(() => iframe.remove(), 1500)
  } catch {
    try {
      window.location.href = VACLY_BRIDGE_PROTOCOL
    } catch {
      /* bloqueado */
    }
  }
}

export type BridgeActivateResult = 'connected' | 'install_downloaded' | 'waiting'

/**
 * Intenta conectar con el puente local sin intervención del usuario.
 * Solo la primera vez en un PC puede hacer falta abrir el .bat descargado (límite del navegador).
 */
export async function activateWindowsBridge(
  probe: () => Promise<boolean>,
  nominasOrigin: string,
  options?: { downloadIfMissing?: boolean },
): Promise<BridgeActivateResult> {
  if (await probe()) return 'connected'

  invokeBridgeProtocol()

  for (let i = 0; i < 8; i += 1) {
    await sleep(400)
    if (await probe()) return 'connected'
  }

  if (options?.downloadIfMissing !== false) {
    downloadWindowsBridgeInstaller(nominasOrigin)
    return 'install_downloaded'
  }

  return 'waiting'
}

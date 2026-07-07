'use client'

import { Button } from '@/components/ui/button'
import {
  ArrowUpTrayIcon,
  BellIcon,
  BellSlashIcon,
  EyeIcon,
  LockClosedIcon,
  QuestionMarkCircleIcon,
  TrashIcon,
  UsersIcon,
} from '@heroicons/react/24/outline'

const iconBtn =
  'h-8 w-8 p-0 text-slate-400 hover:text-[#1B2A41] hover:bg-[#1B2A41]/10 disabled:opacity-40 disabled:pointer-events-none'

interface CertRowActionsProps {
  onView: () => void
  onConfigureNotifications?: () => void
  notificationsEnabled?: boolean
  canConfigureNotifications?: boolean
  showBell?: boolean
  onRevoke?: () => void
  canRevoke?: boolean
  onImportToVacly?: () => void
  showImport?: boolean
  needsScopeChoice?: boolean
  onClassify?: () => void
  onConfigurePermissions?: () => void
  showPermissions?: boolean
  isRestricted?: boolean
}

export function CertRowActions({
  onView,
  onConfigureNotifications,
  notificationsEnabled = true,
  canConfigureNotifications = false,
  showBell = true,
  onRevoke,
  canRevoke = false,
  onImportToVacly,
  showImport = false,
  needsScopeChoice = false,
  onClassify,
  onConfigurePermissions,
  showPermissions = false,
  isRestricted = false,
}: CertRowActionsProps) {
  return (
    <div className="flex items-center justify-center gap-0.5">
      {needsScopeChoice && onClassify && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`${iconBtn} text-amber-600 hover:text-amber-700 hover:bg-amber-50`}
          title="Clasificar: mi empresa o cartera"
          onClick={onClassify}
        >
          <QuestionMarkCircleIcon className="h-4 w-4" />
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={iconBtn}
        title="Ver datos del certificado"
        onClick={onView}
      >
        <EyeIcon className="h-4 w-4" />
      </Button>

      {showBell && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`${iconBtn} ${notificationsEnabled ? '' : 'text-slate-300 hover:text-slate-400'}`}
          title={
            !canConfigureNotifications
              ? 'Disponible en certificados guardados en Vacly'
              : notificationsEnabled
                ? 'Configurar avisos de caducidad'
                : 'Activar y configurar avisos de caducidad'
          }
          disabled={!canConfigureNotifications}
          onClick={onConfigureNotifications}
        >
          {notificationsEnabled ? (
            <BellIcon className="h-4 w-4" />
          ) : (
            <BellSlashIcon className="h-4 w-4" />
          )}
        </Button>
      )}

      {showPermissions && onConfigurePermissions && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`${iconBtn} ${isRestricted ? 'text-[#1B2A41]' : ''}`}
          title={
            isRestricted
              ? 'Permisos de usuarios (acceso restringido)'
              : 'Permisos de usuarios (acceso abierto)'
          }
          onClick={onConfigurePermissions}
        >
          {isRestricted ? <LockClosedIcon className="h-4 w-4" /> : <UsersIcon className="h-4 w-4" />}
        </Button>
      )}

      {showImport && onImportToVacly && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={iconBtn}
          title="Guardar en Vacly"
          onClick={onImportToVacly}
        >
          <ArrowUpTrayIcon className="h-4 w-4" />
        </Button>
      )}

      {canRevoke && onRevoke && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={`${iconBtn} hover:text-rose-600 hover:bg-rose-50`}
          title="Revocar certificado"
          onClick={onRevoke}
        >
          <TrashIcon className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}

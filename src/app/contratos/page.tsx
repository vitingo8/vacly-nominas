'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText, Plus, Search, Trash2, Pencil, AlertTriangle,
  Clock, Users, Briefcase, CalendarDays, X, RefreshCw,
  ChevronDown, Sun, Moon, Upload, Loader2, Sparkles
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table'
import { cn } from '@/lib/utils'

// ─── Types ───────────────────────────────────────────────────────────
interface Employee {
  id: string
  first_name: string
  last_name: string
  nif: string
  status: string
}

interface Contract {
  id: string
  employee_id: string
  company_id: string
  contract_type: 'permanent' | 'temporary' | 'training' | 'internship' | 'specific_work'
  start_date: string
  end_date: string | null
  cotization_group: number | null
  professional_category: string | null
  occupation_code: string | null
  agreement_id: string | null
  full_time: boolean
  workday_percentage: number
  weekly_hours: number
  shift_type: 'continuous' | 'split' | 'rotating' | 'night'
  agreed_base_salary: number
  status: 'active' | 'expired' | 'cancelled'
  signed_pdf_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  employees: Employee
}

type ContractFormData = {
  employee_id: string
  contract_type: string
  start_date: string
  end_date: string
  cotization_group: string
  professional_category: string
  occupation_code: string
  agreement_id: string
  full_time: boolean
  workday_percentage: string
  weekly_hours: string
  shift_type: string
  agreed_base_salary: string
  status: string
  signed_pdf_url: string
  notes: string
}

// ─── Constants ───────────────────────────────────────────────────────
const CONTRACT_TYPES: Record<string, string> = {
  permanent: 'Indefinido',
  temporary: 'Temporal',
  training: 'Formación',
  internship: 'Prácticas',
  specific_work: 'Obra y Servicio'
}

const SHIFT_TYPES: Record<string, string> = {
  continuous: 'Continua',
  split: 'Partida',
  rotating: 'Rotativa',
  night: 'Nocturna'
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  active: {
    label: 'Activo',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200'
  },
  expired: {
    label: 'Expirado',
    className: 'bg-red-100 text-red-700 border-red-200'
  },
  cancelled: {
    label: 'Cancelado',
    className: 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

const COTIZATION_GROUPS: Record<number, string> = {
  1: '1 - Ingenieros y Licenciados',
  2: '2 - Ingenieros Técnicos y Diplomados',
  3: '3 - Jefes Administrativos y de Taller',
  4: '4 - Ayudantes no Titulados',
  5: '5 - Oficiales Administrativos',
  6: '6 - Subalternos',
  7: '7 - Auxiliares Administrativos',
  8: '8 - Oficiales de 1ª y 2ª',
  9: '9 - Oficiales de 3ª y Especialistas',
  10: '10 - Peones',
  11: '11 - Trabajadores menores de 18 años'
}

const EMPTY_FORM: ContractFormData = {
  employee_id: '',
  contract_type: 'permanent',
  start_date: new Date().toISOString().split('T')[0],
  end_date: '',
  cotization_group: '',
  professional_category: '',
  occupation_code: '',
  agreement_id: '',
  full_time: true,
  workday_percentage: '100',
  weekly_hours: '40',
  shift_type: 'continuous',
  agreed_base_salary: '',
  status: 'active',
  signed_pdf_url: '',
  notes: ''
}

// ─── Helper functions ────────────────────────────────────────────────
const formatCurrency = (value: number) =>
  new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2
  }).format(value ?? 0)

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—'
  try {
    const date = new Date(dateString)
    return date.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    })
  } catch {
    return dateString
  }
}

const getEmployeeName = (contract: Contract) => {
  const emp = contract.employees
  if (!emp) return 'Sin empleado'
  return `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Sin nombre'
}

// ─── Component ───────────────────────────────────────────────────────
export default function ContratosPage() {
  // State
  const [contracts, setContracts] = useState<Contract[]>([])
  const [expiringContracts, setExpiringContracts] = useState<Contract[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // PDF Upload with AI
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [uploadingPDF, setUploadingPDF] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [aiProcessing, setAiProcessing] = useState(false)
  const [extractedData, setExtractedData] = useState<Partial<ContractFormData> | null>(null)

  // Filters
  const [filterName, setFilterName] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')

  // Dialogs
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingContract, setEditingContract] = useState<Contract | null>(null)
  const [deletingContract, setDeletingContract] = useState<Contract | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Form
  const [form, setForm] = useState<ContractFormData>(EMPTY_FORM)

  // Pendiente abrir formulario crear con empleado pre-seleccionado (open=create&employee_id=)
  const [pendingOpenCreateEmployeeId, setPendingOpenCreateEmployeeId] = useState<string | null>(null)

  // ── Read URL params ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paramCompanyId = params.get('company_id')
    const uploadPdf = params.get('upload_pdf')
    const openCreate = params.get('open')
    const paramEmployeeId = params.get('employee_id')

    if (paramCompanyId) {
      setCompanyId(paramCompanyId)
    }

    if (uploadPdf === 'true') {
      setTimeout(() => setIsUploadModalOpen(true), 500)
    }

    if (openCreate === 'create' && paramEmployeeId) {
      setPendingOpenCreateEmployeeId(paramEmployeeId)
    }
  }, [])

  // Abrir formulario de crear contrato con empleado pre-seleccionado cuando ya hay empleados cargados
  useEffect(() => {
    if (!pendingOpenCreateEmployeeId || employees.length === 0) return
    setEditingContract(null)
    setForm({ ...EMPTY_FORM, employee_id: pendingOpenCreateEmployeeId })
    setShowFormDialog(true)
    setPendingOpenCreateEmployeeId(null)
  }, [pendingOpenCreateEmployeeId, employees.length])

  // ── Load employees for the select dropdown ───────────────────────
  useEffect(() => {
    if (!companyId) return
    const loadEmployees = async () => {
      try {
        const { createClient } = await import('@supabase/supabase-js')
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        const supabase = createClient(supabaseUrl, supabaseKey)

        const { data } = await supabase
          .from('employees')
          .select('id, first_name, last_name, nif, status')
          .eq('company_id', companyId)
          .eq('status', 'Activo')
          .order('first_name')

        if (data) setEmployees(data)
      } catch (err) {
        console.error('Error cargando empleados:', err)
      }
    }
    loadEmployees()
  }, [companyId])

  // ── Load contracts ───────────────────────────────────────────────
  const loadContracts = useCallback(async () => {
    if (!companyId) return
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ company_id: companyId, expiring_days: '30' })
      if (filterName) params.set('employee_name', filterName)
      if (filterType) params.set('contract_type', filterType)
      if (filterStatus) params.set('status', filterStatus)

      const response = await fetch(`/api/contratos?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setContracts(data.contracts || [])
        setExpiringContracts(data.expiring || [])
      } else {
        setError(data.error || 'Error al cargar contratos')
      }
    } catch (err) {
      console.error('Error cargando contratos:', err)
      setError('Error de conexión al cargar contratos')
    } finally {
      setIsLoading(false)
    }
  }, [companyId, filterName, filterType, filterStatus])

  useEffect(() => {
    loadContracts()
  }, [loadContracts])

  // ── Handlers ─────────────────────────────────────────────────────
  const handleOpenCreate = () => {
    setEditingContract(null)
    setForm(EMPTY_FORM)
    setShowFormDialog(true)
  }

  const handleOpenEdit = (contract: Contract) => {
    setEditingContract(contract)
    setForm({
      employee_id: contract.employee_id,
      contract_type: contract.contract_type,
      start_date: contract.start_date,
      end_date: contract.end_date || '',
      cotization_group: contract.cotization_group?.toString() || '',
      professional_category: contract.professional_category || '',
      occupation_code: contract.occupation_code || '',
      agreement_id: contract.agreement_id || '',
      full_time: contract.full_time,
      workday_percentage: contract.workday_percentage?.toString() || '100',
      weekly_hours: contract.weekly_hours?.toString() || '40',
      shift_type: contract.shift_type || 'continuous',
      agreed_base_salary: contract.agreed_base_salary?.toString() || '',
      status: contract.status,
      signed_pdf_url: contract.signed_pdf_url || '',
      notes: contract.notes || ''
    })
    setShowFormDialog(true)
  }

  const handleOpenDelete = (contract: Contract) => {
    setDeletingContract(contract)
    setShowDeleteDialog(true)
  }

  const handleSave = async () => {
    if (!companyId) return
    if (!form.employee_id || !form.contract_type || !form.start_date) {
      alert('Por favor completa los campos obligatorios: Empleado, Tipo de Contrato y Fecha de Inicio.')
      return
    }

    setIsSaving(true)
    try {
      const payload: any = {
        company_id: companyId,
        ...form,
        end_date: form.end_date || null,
        cotization_group: form.cotization_group || null,
        workday_percentage: form.workday_percentage || 100,
        weekly_hours: form.weekly_hours || 40,
        agreed_base_salary: form.agreed_base_salary || 0
      }

      if (editingContract) {
        payload.id = editingContract.id
      }

      const response = await fetch('/api/contratos', {
        method: editingContract ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        setShowFormDialog(false)
        setEditingContract(null)
        setForm(EMPTY_FORM)
        await loadContracts()
      } else {
        alert(`Error: ${data.error || 'No se pudo guardar el contrato'}`)
      }
    } catch (err) {
      console.error('Error guardando contrato:', err)
      alert('Error al guardar el contrato.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingContract || !companyId) return
    setIsSaving(true)
    try {
      const response = await fetch(
        `/api/contratos?id=${deletingContract.id}&company_id=${encodeURIComponent(companyId)}`,
        { method: 'DELETE' }
      )
      const data = await response.json()

      if (data.success) {
        setShowDeleteDialog(false)
        setDeletingContract(null)
        await loadContracts()
      } else {
        alert(`Error: ${data.error || 'No se pudo eliminar el contrato'}`)
      }
    } catch (err) {
      console.error('Error eliminando contrato:', err)
      alert('Error al eliminar el contrato.')
    } finally {
      setIsSaving(false)
    }
  }

  const clearFilters = () => {
    setFilterName('')
    setFilterType('')
    setFilterStatus('')
  }

  const hasActiveFilters = filterName || filterType || filterStatus

  // ── Stats ────────────────────────────────────────────────────────
  const totalContracts = contracts.length
  const activeContracts = contracts.filter(c => c.status === 'active').length
  const temporaryContracts = contracts.filter(c =>
    c.contract_type === 'temporary' || c.contract_type === 'specific_work'
  ).length

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="w-full min-h-screen bg-transparent">
      <div className="w-full px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1B2A41] to-[#C6A664] flex items-center justify-center shadow-sm">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1B2A41]">Contratos</h1>
              <p className="text-sm text-slate-500">Gestión de contratos laborales</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadContracts}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              Actualizar
            </Button>
            <Button
              onClick={handleOpenCreate}
              variant="outline"
              className="gap-2 border-[#1B2A41] text-[#1B2A41] hover:bg-[#1B2A41]/5"
            >
              <Plus className="w-4 h-4" />
              Nuevo Contrato
            </Button>
            <Button
              onClick={() => setIsUploadModalOpen(true)}
              className="bg-[#C6A664] hover:bg-[#C6A664]/90 text-white gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Subir PDF con IA
            </Button>
          </div>
        </div>

        {/* Alert: Expiring contracts */}
        {expiringContracts.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50/80 p-4 backdrop-blur-sm">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 flex-shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-amber-800">
                  Contratos por vencer ({expiringContracts.length})
                </h3>
                <p className="text-sm text-amber-700 mt-0.5">
                  Los siguientes contratos expiran en los próximos 30 días:
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {expiringContracts.map((c) => (
                    <Badge
                      key={c.id}
                      className="bg-amber-100 text-amber-800 border-amber-300 cursor-pointer hover:bg-amber-200 transition-colors"
                      onClick={() => handleOpenEdit(c)}
                    >
                      <Clock className="w-3 h-3 mr-1" />
                      {getEmployeeName(c)} — vence {formatDate(c.end_date)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
          <Card className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/80 shadow-md backdrop-blur-md">
            <div className="absolute inset-0 bg-[#1B2A41]/5 opacity-70" />
            <CardHeader className="relative z-10 pb-1 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1B2A41] shadow-sm">
                  <FileText className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700">Total Contratos</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-3">
              <div className="text-2xl font-bold text-[#1B2A41] tabular-nums">{totalContracts}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/80 shadow-md backdrop-blur-md">
            <div className="absolute inset-0 bg-emerald-500/5 opacity-70" />
            <CardHeader className="relative z-10 pb-1 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700">Contratos Activos</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-3">
              <div className="text-2xl font-bold text-emerald-700 tabular-nums">{activeContracts}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/80 shadow-md backdrop-blur-md">
            <div className="absolute inset-0 bg-[#C6A664]/5 opacity-70" />
            <CardHeader className="relative z-10 pb-1 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C6A664] shadow-sm">
                  <Briefcase className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700">Temporales</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-3">
              <div className="text-2xl font-bold text-[#C6A664] tabular-nums">{temporaryContracts}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6 border-slate-200/50 bg-white/80 backdrop-blur-md shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="relative flex-1 w-full sm:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Buscar por nombre de empleado..."
                  value={filterName}
                  onChange={(e) => setFilterName(e.target.value)}
                  className="pl-9 h-9 border-slate-200 focus:ring-[#C6A664] focus:border-[#C6A664]"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#C6A664] focus:border-transparent"
              >
                <option value="">Todos los tipos</option>
                {Object.entries(CONTRACT_TYPES).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#C6A664] focus:border-transparent"
              >
                <option value="">Todos los estados</option>
                <option value="active">Activo</option>
                <option value="expired">Expirado</option>
                <option value="cancelled">Cancelado</option>
              </select>
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-9 gap-1 text-slate-500 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                  Limpiar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {isLoading && contracts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C6A664] border-t-transparent" />
          </div>
        ) : contracts.length === 0 && !isLoading ? (
          /* Empty state */
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-10 h-10 text-[#C6A664]/50" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Sin contratos</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              {hasActiveFilters
                ? 'No se encontraron contratos con los filtros aplicados.'
                : 'Comienza creando el primer contrato para un empleado.'}
            </p>
            {!hasActiveFilters && (
              <Button
                onClick={handleOpenCreate}
                className="bg-[#1B2A41] hover:bg-[#152036] text-white gap-2"
              >
                <Plus className="w-4 h-4" />
                Crear Contrato
              </Button>
            )}
          </div>
        ) : (
          /* Table */
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-slate-700">Empleado</TableHead>
                  <TableHead className="font-semibold text-slate-700">Tipo Contrato</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Fecha Inicio</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Fecha Fin</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Grupo Cotización</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Jornada</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Salario Base</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Estado</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contracts.map((contract) => {
                  const empName = getEmployeeName(contract)
                  const statusCfg = STATUS_CONFIG[contract.status] || STATUS_CONFIG.cancelled
                  const journeyLabel = contract.full_time
                    ? 'Completa'
                    : `Parcial (${contract.workday_percentage}%)`

                  return (
                    <TableRow key={contract.id} className="hover:bg-slate-50/50">
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1B2A41] to-slate-700 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-white">
                              {empName.charAt(0).toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <span className="font-medium text-slate-800 block">{empName}</span>
                            {contract.employees?.nif && (
                              <span className="text-xs text-slate-500">{contract.employees.nif}</span>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-[#1B2A41]/10 text-[#1B2A41] border-[#1B2A41]/20">
                          {CONTRACT_TYPES[contract.contract_type] || contract.contract_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-slate-600">
                        {formatDate(contract.start_date)}
                      </TableCell>
                      <TableCell className="text-center text-sm text-slate-600">
                        {formatDate(contract.end_date)}
                      </TableCell>
                      <TableCell className="text-center text-sm text-slate-600">
                        {contract.cotization_group || '—'}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex flex-col items-center">
                          <span className="text-sm text-slate-700">{journeyLabel}</span>
                          <span className="text-xs text-slate-500">{contract.weekly_hours}h/sem</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="text-sm font-mono font-semibold text-[#1B2A41]">
                          {formatCurrency(contract.agreed_base_salary)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={statusCfg.className}>
                          {statusCfg.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(contract)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-[#C6A664] hover:bg-[#C6A664]/10"
                            title="Editar contrato"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenDelete(contract)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Eliminar contrato"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Contracts count footer */}
        {contracts.length > 0 && (
          <div className="mt-4 text-center">
            <span className="text-sm text-slate-500">
              Mostrando {contracts.length} contrato{contracts.length !== 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Create / Edit Dialog ──────────────────────────────────── */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">
              {editingContract ? 'Editar Contrato' : 'Nuevo Contrato'}
            </DialogTitle>
            <DialogDescription>
              {editingContract
                ? 'Modifica los datos del contrato laboral.'
                : 'Completa los datos para registrar un nuevo contrato laboral.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            {/* Empleado + Tipo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Empleado *</Label>
                <select
                  value={form.employee_id}
                  onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                >
                  <option value="">Seleccionar empleado...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.first_name} {emp.last_name} {emp.nif ? `(${emp.nif})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Tipo de Contrato *</Label>
                <select
                  value={form.contract_type}
                  onChange={(e) => setForm({ ...form, contract_type: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                >
                  {Object.entries(CONTRACT_TYPES).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fechas */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Fecha de Inicio *</Label>
                <Input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Fecha de Fin</Label>
                <Input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>

            {/* Grupo cotización + Categoría profesional */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Grupo de Cotización</Label>
                <select
                  value={form.cotization_group}
                  onChange={(e) => setForm({ ...form, cotization_group: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                >
                  <option value="">Seleccionar grupo...</option>
                  {Object.entries(COTIZATION_GROUPS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Categoría Profesional</Label>
                <Input
                  value={form.professional_category}
                  onChange={(e) => setForm({ ...form, professional_category: e.target.value })}
                  placeholder="Ej: Administrativo/a"
                />
              </div>
            </div>

            {/* Código ocupación + Convenio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Código de Ocupación</Label>
                <Input
                  value={form.occupation_code}
                  onChange={(e) => setForm({ ...form, occupation_code: e.target.value })}
                  placeholder="Ej: 4110"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Convenio Colectivo</Label>
                <Input
                  value={form.agreement_id}
                  onChange={(e) => setForm({ ...form, agreement_id: e.target.value })}
                  placeholder="ID del convenio"
                />
              </div>
            </div>

            {/* Jornada section */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-4 bg-slate-50/50">
              <h4 className="text-sm font-semibold text-[#1B2A41] flex items-center gap-2">
                <CalendarDays className="w-4 h-4" />
                Jornada Laboral
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Tipo de Jornada</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={form.full_time}
                        onChange={() => setForm({ ...form, full_time: true, workday_percentage: '100' })}
                        className="accent-[#1B2A41]"
                      />
                      <span className="text-sm text-slate-700">Completa</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!form.full_time}
                        onChange={() => setForm({ ...form, full_time: false })}
                        className="accent-[#1B2A41]"
                      />
                      <span className="text-sm text-slate-700">Parcial</span>
                    </label>
                  </div>
                </div>
                {!form.full_time && (
                  <div className="space-y-2">
                    <Label className="text-slate-700">Porcentaje Jornada (%)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      value={form.workday_percentage}
                      onChange={(e) => setForm({ ...form, workday_percentage: e.target.value })}
                    />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Horas Semanales</Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="1"
                    value={form.weekly_hours}
                    onChange={(e) => setForm({ ...form, weekly_hours: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Tipo de Turno</Label>
                  <select
                    value={form.shift_type}
                    onChange={(e) => setForm({ ...form, shift_type: e.target.value })}
                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    {Object.entries(SHIFT_TYPES).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Salario + Estado */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Salario Base Anual (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.agreed_base_salary}
                  onChange={(e) => setForm({ ...form, agreed_base_salary: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Estado</Label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                >
                  <option value="active">Activo</option>
                  <option value="expired">Expirado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>

            {/* PDF URL */}
            <div className="space-y-2">
              <Label className="text-slate-700">URL del Contrato Firmado (PDF)</Label>
              <Input
                value={form.signed_pdf_url}
                onChange={(e) => setForm({ ...form, signed_pdf_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            {/* Notas */}
            <div className="space-y-2">
              <Label className="text-slate-700">Notas</Label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Observaciones adicionales..."
                rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowFormDialog(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.employee_id || !form.contract_type || !form.start_date}
              className="bg-[#1B2A41] hover:bg-[#152036] text-white"
            >
              {isSaving ? 'Guardando...' : editingContract ? 'Guardar Cambios' : 'Crear Contrato'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ────────────────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">Eliminar Contrato</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deletingContract && (
            <div className="py-4">
              <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
                <p className="text-sm text-slate-700">
                  ¿Estás seguro de que deseas eliminar el contrato de{' '}
                  <strong>{getEmployeeName(deletingContract)}</strong>?
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>Tipo: {CONTRACT_TYPES[deletingContract.contract_type]}</span>
                  <span>·</span>
                  <span>Inicio: {formatDate(deletingContract.start_date)}</span>
                  {deletingContract.end_date && (
                    <>
                      <span>·</span>
                      <span>Fin: {formatDate(deletingContract.end_date)}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isSaving}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDelete}
              disabled={isSaving}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isSaving ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── PDF Upload with AI Modal ── */}
      <Dialog open={isUploadModalOpen} onOpenChange={setIsUploadModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[#1B2A41]">
              <Sparkles className="w-5 h-5 text-[#C6A664]" />
              Subir Contrato en PDF con IA
            </DialogTitle>
            <DialogDescription>
              Sube un contrato en PDF y se extraerán automáticamente todos los datos para crear el contrato.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* File upload */}
            {!uploadedFile && !extractedData && (
              <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center hover:border-[#C6A664] transition-colors">
                <Upload className="w-12 h-12 mx-auto mb-3 text-slate-400" />
                <p className="text-sm text-slate-600 mb-4">
                  Arrastra un archivo PDF aquí o haz clic para seleccionar
                </p>
                <Input
                  type="file"
                  accept=".pdf"
                  className="max-w-xs mx-auto"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file && file.type === 'application/pdf') {
                      setUploadedFile(file)
                    } else {
                      alert('Por favor selecciona un archivo PDF')
                    }
                  }}
                />
              </div>
            )}

            {/* File selected */}
            {uploadedFile && !extractedData && (
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="w-8 h-8 text-[#C6A664]" />
                    <div>
                      <p className="font-medium text-sm">{uploadedFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {(uploadedFile.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadedFile(null)}
                    disabled={aiProcessing}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )}

            {/* AI Processing */}
            {aiProcessing && (
              <div className="flex items-center justify-center py-8">
                <div className="text-center space-y-3">
                  <div className="relative inline-block">
                    <Loader2 className="w-12 h-12 animate-spin text-[#C6A664]" />
                    <Sparkles className="w-5 h-5 text-[#C6A664] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                    Claude Haiku está leyendo el contrato...
                  </p>
                  <p className="text-xs text-slate-500">Esto puede tardar 10-30 segundos</p>
                </div>
              </div>
            )}

            {/* Extracted data preview */}
            {extractedData && (
              <div className="border border-emerald-200 rounded-lg p-4 bg-emerald-50/50">
                <div className="flex items-start gap-3 mb-3">
                  <Sparkles className="w-5 h-5 text-emerald-600 mt-0.5" />
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm text-emerald-900">
                      Datos extraídos correctamente
                    </h4>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Revisa los datos antes de crear el contrato
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {extractedData.employee_id && (
                    <div>
                      <span className="text-slate-500">Empleado:</span>{' '}
                      <span className="font-medium">
                        {employees.find(e => e.id === extractedData.employee_id)?.first_name || 'N/A'}
                      </span>
                    </div>
                  )}
                  {extractedData.contract_type && (
                    <div>
                      <span className="text-slate-500">Tipo:</span>{' '}
                      <span className="font-medium">{CONTRACT_TYPES[extractedData.contract_type] || extractedData.contract_type}</span>
                    </div>
                  )}
                  {extractedData.start_date && (
                    <div>
                      <span className="text-slate-500">Inicio:</span>{' '}
                      <span className="font-medium">{formatDate(extractedData.start_date)}</span>
                    </div>
                  )}
                  {extractedData.agreed_base_salary && (
                    <div>
                      <span className="text-slate-500">Salario:</span>{' '}
                      <span className="font-medium">{extractedData.agreed_base_salary}€</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            {!extractedData ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsUploadModalOpen(false)
                    setUploadedFile(null)
                    setAiProcessing(false)
                  }}
                  disabled={aiProcessing}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={async () => {
                    if (!uploadedFile) return
                    setAiProcessing(true)
                    
                    try {
                      const formData = new FormData()
                      formData.append('file', uploadedFile)
                      formData.append('company_id', companyId || '')
                      
                      const res = await fetch('/api/contratos/extract-pdf', {
                        method: 'POST',
                        body: formData
                      })
                      
                      const data = await res.json()
                      
                      if (!data.success) {
                        throw new Error(data.error || 'Error al procesar el PDF')
                      }
                      
                      // Try to match employee by NIF or name
                      let matchedEmployeeId = data.contract.employee_id
                      if (data.contract.employee_nif) {
                        const match = employees.find(e => 
                          e.nif?.toLowerCase() === data.contract.employee_nif.toLowerCase()
                        )
                        if (match) {
                          matchedEmployeeId = match.id
                        }
                      } else if (data.contract.employee_name) {
                        const match = employees.find(e => {
                          const fullName = `${e.first_name} ${e.last_name}`.toLowerCase()
                          return fullName.includes(data.contract.employee_name.toLowerCase()) ||
                                 data.contract.employee_name.toLowerCase().includes(fullName)
                        })
                        if (match) {
                          matchedEmployeeId = match.id
                        }
                      }
                      
                      setExtractedData({
                        ...data.contract,
                        employee_id: matchedEmployeeId || employees[0]?.id || '',
                      })
                    } catch (err) {
                      alert('Error al procesar el PDF: ' + (err instanceof Error ? err.message : 'Error desconocido'))
                      setUploadedFile(null)
                    } finally {
                      setAiProcessing(false)
                    }
                  }}
                  disabled={!uploadedFile || aiProcessing}
                  className="bg-[#C6A664] hover:bg-[#C6A664]/90 text-white"
                >
                  {aiProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Procesar con IA
                    </>
                  )}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => {
                    setExtractedData(null)
                    setUploadedFile(null)
                  }}
                >
                  Subir otro PDF
                </Button>
                <Button
                  onClick={() => {
                    // Pre-fill form with extracted data and open create modal
                    setForm({
                      ...EMPTY_FORM,
                      ...extractedData,
                      cotization_group: extractedData.cotization_group || '',
                      agreed_base_salary: extractedData.agreed_base_salary || '',
                      workday_percentage: extractedData.workday_percentage || '100',
                      weekly_hours: extractedData.weekly_hours || '40',
                    })
                    setIsUploadModalOpen(false)
                    setShowFormDialog(true)
                    setExtractedData(null)
                    setUploadedFile(null)
                  }}
                  className="bg-[#1B2A41] hover:bg-[#152036] text-white"
                >
                  Crear Contrato con estos datos
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

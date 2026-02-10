'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Coins, Plus, Search, Trash2, Pencil, X, RefreshCw,
  Check, XCircle, BookOpen, ChevronDown, ToggleLeft, ToggleRight,
  HelpCircle, Info
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
interface SalaryConcept {
  id: string
  company_id: string
  code: string
  name: string
  description: string | null
  type: 'salary' | 'non_salary'
  cotizes_ss: boolean
  tributes_irpf: boolean
  calculation_formula: string | null
  agreement_id: string | null
  active: boolean
  educational_tooltip: string | null
  created_at: string
  updated_at: string
}

type ConceptFormData = {
  code: string
  name: string
  description: string
  type: 'salary' | 'non_salary'
  cotizes_ss: boolean
  tributes_irpf: boolean
  calculation_formula: string
  agreement_id: string
  active: boolean
  educational_tooltip: string
}

// ─── Predefined Concepts Library ─────────────────────────────────────
interface PredefinedConcept {
  code: string
  name: string
  description: string
  type: 'salary' | 'non_salary'
  cotizes_ss: boolean
  tributes_irpf: boolean
  educational_tooltip: string
}

const PREDEFINED_CONCEPTS: PredefinedConcept[] = [
  {
    code: 'PA001',
    name: 'Plus Antigüedad',
    description: 'Complemento salarial por antigüedad en la empresa. Se calcula en función de los años de servicio.',
    type: 'salary',
    cotizes_ss: true,
    tributes_irpf: true,
    educational_tooltip: 'El plus de antigüedad es un complemento retributivo que premia la permanencia del trabajador en la empresa. Suele regularse por convenio colectivo.'
  },
  {
    code: 'PN001',
    name: 'Plus Nocturnidad',
    description: 'Complemento por trabajo realizado en horario nocturno (22:00 a 06:00).',
    type: 'salary',
    cotizes_ss: true,
    tributes_irpf: true,
    educational_tooltip: 'La nocturnidad es un complemento que retribuye el trabajo realizado entre las 22:00 y las 06:00. El Estatuto de los Trabajadores establece que no puede ser inferior al determinado por convenio.'
  },
  {
    code: 'PT001',
    name: 'Plus Transporte',
    description: 'Compensación por gastos de desplazamiento al centro de trabajo.',
    type: 'non_salary',
    cotizes_ss: false,
    tributes_irpf: false,
    educational_tooltip: 'El plus de transporte compensa los gastos de desplazamiento del trabajador. Si no supera los límites legales, está exento de cotización a la Seguridad Social y de tributación en IRPF.'
  },
  {
    code: 'PP001',
    name: 'Plus Peligrosidad',
    description: 'Complemento por trabajos en condiciones de especial peligrosidad.',
    type: 'salary',
    cotizes_ss: true,
    tributes_irpf: true,
    educational_tooltip: 'El plus de peligrosidad retribuye el riesgo adicional que asume el trabajador. Es un complemento de puesto de trabajo que cotiza a la Seguridad Social.'
  },
  {
    code: 'DI001',
    name: 'Dietas',
    description: 'Compensación por gastos de manutención durante desplazamientos laborales.',
    type: 'non_salary',
    cotizes_ss: false,
    tributes_irpf: false,
    educational_tooltip: 'Las dietas compensan los gastos de manutención en desplazamientos. Están exentas hasta los límites del RIPF: 26,67€/día (nacional) y 48,08€/día (internacional) sin pernocta.'
  },
  {
    code: 'KM001',
    name: 'Kilometraje',
    description: 'Compensación por uso de vehículo propio para desplazamientos laborales.',
    type: 'non_salary',
    cotizes_ss: false,
    tributes_irpf: false,
    educational_tooltip: 'El kilometraje compensa el uso del vehículo propio. Está exento hasta 0,19€/km según la normativa fiscal vigente.'
  },
  {
    code: 'HE001',
    name: 'Horas Extra',
    description: 'Retribución por horas trabajadas por encima de la jornada ordinaria.',
    type: 'salary',
    cotizes_ss: true,
    tributes_irpf: true,
    educational_tooltip: 'Las horas extraordinarias cotizan a un tipo adicional del 23,60% (empresa) y 4,70% (trabajador). El máximo legal es de 80 horas extra al año.'
  },
  {
    code: 'PE001',
    name: 'Paga Extra',
    description: 'Gratificación extraordinaria. Los trabajadores tienen derecho a dos pagas extras al año.',
    type: 'salary',
    cotizes_ss: true,
    tributes_irpf: true,
    educational_tooltip: 'El Estatuto de los Trabajadores establece el derecho a dos gratificaciones extraordinarias al año, una en Navidad y otra según convenio. Pueden prorratearse mensualmente.'
  },
  {
    code: 'TR001',
    name: 'Ticket Restaurante',
    description: 'Retribución en especie mediante vales de comida para días laborables.',
    type: 'non_salary',
    cotizes_ss: false,
    tributes_irpf: false,
    educational_tooltip: 'El ticket restaurante está exento de IRPF hasta 11€/día laborable. Es una retribución en especie muy utilizada como beneficio social.'
  },
  {
    code: 'SM001',
    name: 'Seguro Médico',
    description: 'Retribución en especie mediante seguro de salud privado para el empleado.',
    type: 'non_salary',
    cotizes_ss: false,
    tributes_irpf: false,
    educational_tooltip: 'El seguro médico está exento de IRPF hasta 500€/año por asegurado (1.500€ para personas con discapacidad). Incluye al cónyuge y descendientes.'
  }
]

// ─── Constants ───────────────────────────────────────────────────────
const TYPE_LABELS: Record<string, string> = {
  salary: 'Salarial',
  non_salary: 'No Salarial'
}

const EMPTY_FORM: ConceptFormData = {
  code: '',
  name: '',
  description: '',
  type: 'salary',
  cotizes_ss: true,
  tributes_irpf: true,
  calculation_formula: '',
  agreement_id: '',
  active: true,
  educational_tooltip: ''
}

// ─── Component ───────────────────────────────────────────────────────
export default function ConceptosPage() {
  // State
  const [concepts, setConcepts] = useState<SalaryConcept[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [filterSearch, setFilterSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterActive, setFilterActive] = useState('')

  // Dialogs
  const [showFormDialog, setShowFormDialog] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingConcept, setEditingConcept] = useState<SalaryConcept | null>(null)
  const [deletingConcept, setDeletingConcept] = useState<SalaryConcept | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Predefined dropdown
  const [showPredefined, setShowPredefined] = useState(false)

  // Form
  const [form, setForm] = useState<ConceptFormData>(EMPTY_FORM)

  // ── Read URL params ──────────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paramCompanyId = params.get('company_id')
    if (paramCompanyId) {
      setCompanyId(paramCompanyId)
    }
  }, [])

  // ── Load concepts ───────────────────────────────────────────────
  const loadConcepts = useCallback(async () => {
    if (!companyId) return
    setIsLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams({ company_id: companyId })
      if (filterSearch) params.set('search', filterSearch)
      if (filterType) params.set('type', filterType)
      if (filterActive) params.set('active', filterActive)

      const response = await fetch(`/api/conceptos?${params.toString()}`)
      const data = await response.json()

      if (data.success) {
        setConcepts(data.concepts || [])
      } else {
        setError(data.error || 'Error al cargar conceptos salariales')
      }
    } catch (err) {
      console.error('Error cargando conceptos:', err)
      setError('Error de conexión al cargar conceptos salariales')
    } finally {
      setIsLoading(false)
    }
  }, [companyId, filterSearch, filterType, filterActive])

  useEffect(() => {
    loadConcepts()
  }, [loadConcepts])

  // ── Handlers ─────────────────────────────────────────────────────
  const handleOpenCreate = () => {
    setEditingConcept(null)
    setForm(EMPTY_FORM)
    setShowPredefined(false)
    setShowFormDialog(true)
  }

  const handleOpenEdit = (concept: SalaryConcept) => {
    setEditingConcept(concept)
    setForm({
      code: concept.code,
      name: concept.name,
      description: concept.description || '',
      type: concept.type,
      cotizes_ss: concept.cotizes_ss,
      tributes_irpf: concept.tributes_irpf,
      calculation_formula: concept.calculation_formula || '',
      agreement_id: concept.agreement_id || '',
      active: concept.active,
      educational_tooltip: concept.educational_tooltip || ''
    })
    setShowPredefined(false)
    setShowFormDialog(true)
  }

  const handleOpenDelete = (concept: SalaryConcept) => {
    setDeletingConcept(concept)
    setShowDeleteDialog(true)
  }

  const handleSelectPredefined = (predefined: PredefinedConcept) => {
    setForm({
      ...form,
      code: predefined.code,
      name: predefined.name,
      description: predefined.description,
      type: predefined.type,
      cotizes_ss: predefined.cotizes_ss,
      tributes_irpf: predefined.tributes_irpf,
      educational_tooltip: predefined.educational_tooltip
    })
    setShowPredefined(false)
  }

  const handleSave = async () => {
    if (!companyId) return
    if (!form.code || !form.name || !form.type) {
      alert('Por favor completa los campos obligatorios: Código, Nombre y Tipo.')
      return
    }

    setIsSaving(true)
    try {
      const payload: Record<string, unknown> = {
        company_id: companyId,
        ...form,
        description: form.description || null,
        calculation_formula: form.calculation_formula || null,
        agreement_id: form.agreement_id || null,
        educational_tooltip: form.educational_tooltip || null
      }

      if (editingConcept) {
        payload.id = editingConcept.id
      }

      const response = await fetch('/api/conceptos', {
        method: editingConcept ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await response.json()

      if (data.success) {
        setShowFormDialog(false)
        setEditingConcept(null)
        setForm(EMPTY_FORM)
        await loadConcepts()
      } else {
        alert(`Error: ${data.error || 'No se pudo guardar el concepto'}`)
      }
    } catch (err) {
      console.error('Error guardando concepto:', err)
      alert('Error al guardar el concepto salarial.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deletingConcept || !companyId) return
    setIsSaving(true)
    try {
      const response = await fetch(
        `/api/conceptos?id=${deletingConcept.id}&company_id=${encodeURIComponent(companyId)}`,
        { method: 'DELETE' }
      )
      const data = await response.json()

      if (data.success) {
        setShowDeleteDialog(false)
        setDeletingConcept(null)
        await loadConcepts()
      } else {
        alert(`Error: ${data.error || 'No se pudo eliminar el concepto'}`)
      }
    } catch (err) {
      console.error('Error eliminando concepto:', err)
      alert('Error al eliminar el concepto salarial.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleToggleActive = async (concept: SalaryConcept) => {
    if (!companyId) return
    try {
      const response = await fetch('/api/conceptos', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: concept.id,
          company_id: companyId,
          active: !concept.active
        })
      })

      const data = await response.json()
      if (data.success) {
        await loadConcepts()
      } else {
        alert(`Error: ${data.error || 'No se pudo cambiar el estado'}`)
      }
    } catch (err) {
      console.error('Error cambiando estado:', err)
      alert('Error al cambiar el estado del concepto.')
    }
  }

  const clearFilters = () => {
    setFilterSearch('')
    setFilterType('')
    setFilterActive('')
  }

  const hasActiveFilters = filterSearch || filterType || filterActive

  // ── Stats ────────────────────────────────────────────────────────
  const totalConcepts = concepts.length
  const salaryConcepts = concepts.filter(c => c.type === 'salary').length
  const nonSalaryConcepts = concepts.filter(c => c.type === 'non_salary').length
  const activeConcepts = concepts.filter(c => c.active).length

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="w-full min-h-screen bg-transparent">
      <div className="w-full px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1B2A41] to-[#C6A664] flex items-center justify-center shadow-sm">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1B2A41]">Conceptos Salariales</h1>
              <p className="text-sm text-slate-500">Gestión de conceptos retributivos y no retributivos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadConcepts}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
              Actualizar
            </Button>
            <Button
              onClick={handleOpenCreate}
              className="bg-[#1B2A41] hover:bg-[#152036] text-white gap-2"
            >
              <Plus className="w-4 h-4" />
              Nuevo Concepto
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
          <Card className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/80 shadow-md backdrop-blur-md">
            <div className="absolute inset-0 bg-[#1B2A41]/5 opacity-70" />
            <CardHeader className="relative z-10 pb-1 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#1B2A41] shadow-sm">
                  <Coins className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700">Total</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-3">
              <div className="text-2xl font-bold text-[#1B2A41] tabular-nums">{totalConcepts}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/80 shadow-md backdrop-blur-md">
            <div className="absolute inset-0 bg-emerald-500/5 opacity-70" />
            <CardHeader className="relative z-10 pb-1 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 shadow-sm">
                  <Check className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700">Salariales</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-3">
              <div className="text-2xl font-bold text-emerald-700 tabular-nums">{salaryConcepts}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/80 shadow-md backdrop-blur-md">
            <div className="absolute inset-0 bg-blue-500/5 opacity-70" />
            <CardHeader className="relative z-10 pb-1 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 shadow-sm">
                  <BookOpen className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700">No Salariales</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-3">
              <div className="text-2xl font-bold text-blue-700 tabular-nums">{nonSalaryConcepts}</div>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden rounded-xl border border-slate-200/50 bg-white/80 shadow-md backdrop-blur-md">
            <div className="absolute inset-0 bg-[#C6A664]/5 opacity-70" />
            <CardHeader className="relative z-10 pb-1 pt-3 px-4">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#C6A664] shadow-sm">
                  <ToggleRight className="h-4 w-4 text-white" />
                </div>
                <CardTitle className="text-sm font-semibold text-slate-700">Activos</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="relative z-10 px-4 pb-3">
              <div className="text-2xl font-bold text-[#C6A664] tabular-nums">{activeConcepts}</div>
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
                  placeholder="Buscar por nombre o código..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="pl-9 h-9 border-slate-200 focus:ring-[#C6A664] focus:border-[#C6A664]"
                />
              </div>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#C6A664] focus:border-transparent"
              >
                <option value="">Todos los tipos</option>
                <option value="salary">Salarial</option>
                <option value="non_salary">No Salarial</option>
              </select>
              <select
                value={filterActive}
                onChange={(e) => setFilterActive(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#C6A664] focus:border-transparent"
              >
                <option value="">Todos los estados</option>
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
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
        {isLoading && concepts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C6A664] border-t-transparent" />
          </div>
        ) : concepts.length === 0 && !isLoading ? (
          /* Empty state */
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5 flex items-center justify-center mx-auto mb-4">
              <Coins className="w-10 h-10 text-[#C6A664]/50" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Sin conceptos salariales</h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6">
              {hasActiveFilters
                ? 'No se encontraron conceptos con los filtros aplicados.'
                : 'Comienza creando el primer concepto salarial o añade conceptos predefinidos.'}
            </p>
            {!hasActiveFilters && (
              <Button
                onClick={handleOpenCreate}
                className="bg-[#1B2A41] hover:bg-[#152036] text-white gap-2"
              >
                <Plus className="w-4 h-4" />
                Crear Concepto
              </Button>
            )}
          </div>
        ) : (
          /* Table */
          <Card className="overflow-hidden border-slate-200 shadow-sm">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-slate-700">Código</TableHead>
                  <TableHead className="font-semibold text-slate-700">Nombre</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Tipo</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Cotiza SS</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Tributa IRPF</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Activo</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center w-28">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {concepts.map((concept) => (
                  <TableRow key={concept.id} className={cn("hover:bg-slate-50/50", !concept.active && "opacity-60")}>
                    <TableCell>
                      <span className="font-mono text-sm font-semibold text-[#1B2A41]">
                        {concept.code}
                      </span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div>
                          <span className="font-medium text-slate-800 block">{concept.name}</span>
                          {concept.description && (
                            <span className="text-xs text-slate-500 line-clamp-1">{concept.description}</span>
                          )}
                        </div>
                        {concept.educational_tooltip && (
                          <div className="relative group">
                            <HelpCircle className="w-3.5 h-3.5 text-slate-400 cursor-help flex-shrink-0" />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 bg-[#1B2A41] text-white text-xs rounded-lg shadow-lg opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-opacity z-50">
                              <div className="flex items-start gap-2">
                                <Info className="w-3.5 h-3.5 text-[#C6A664] flex-shrink-0 mt-0.5" />
                                <span>{concept.educational_tooltip}</span>
                              </div>
                              <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-[#1B2A41] rotate-45" />
                            </div>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {concept.type === 'salary' ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                          Salarial
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                          No Salarial
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {concept.cotizes_ss ? (
                        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-300 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {concept.tributes_irpf ? (
                        <Check className="w-4 h-4 text-emerald-600 mx-auto" />
                      ) : (
                        <XCircle className="w-4 h-4 text-slate-300 mx-auto" />
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <button
                        onClick={() => handleToggleActive(concept)}
                        className={cn(
                          "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer",
                          concept.active
                            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                        )}
                        title={concept.active ? 'Desactivar concepto' : 'Activar concepto'}
                      >
                        {concept.active ? (
                          <>
                            <ToggleRight className="w-3.5 h-3.5" />
                            Sí
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-3.5 h-3.5" />
                            No
                          </>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenEdit(concept)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-[#C6A664] hover:bg-[#C6A664]/10"
                          title="Editar concepto"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleOpenDelete(concept)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                          title="Eliminar concepto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Concepts count footer */}
        {concepts.length > 0 && (
          <div className="mt-4 text-center">
            <span className="text-sm text-slate-500">
              Mostrando {concepts.length} concepto{concepts.length !== 1 ? 's' : ''} salarial{concepts.length !== 1 ? 'es' : ''}
            </span>
          </div>
        )}
      </div>

      {/* ── Create / Edit Dialog ──────────────────────────────────── */}
      <Dialog open={showFormDialog} onOpenChange={setShowFormDialog}>
        <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">
              {editingConcept ? 'Editar Concepto Salarial' : 'Nuevo Concepto Salarial'}
            </DialogTitle>
            <DialogDescription>
              {editingConcept
                ? 'Modifica los datos del concepto salarial.'
                : 'Completa los datos para registrar un nuevo concepto salarial.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 mt-4">
            {/* Predefined Concepts Button */}
            {!editingConcept && (
              <div className="relative">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowPredefined(!showPredefined)}
                  className="w-full justify-between border-[#C6A664]/30 text-[#1B2A41] hover:bg-[#C6A664]/5 hover:border-[#C6A664]/50"
                >
                  <span className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#C6A664]" />
                    Añadir Predefinido
                  </span>
                  <ChevronDown className={cn("w-4 h-4 transition-transform", showPredefined && "rotate-180")} />
                </Button>

                {showPredefined && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                    {PREDEFINED_CONCEPTS.map((pc) => (
                      <button
                        key={pc.code}
                        onClick={() => handleSelectPredefined(pc)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-xs font-semibold text-[#1B2A41]">{pc.code}</span>
                              <span className="font-medium text-sm text-slate-800">{pc.name}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{pc.description}</p>
                          </div>
                          <Badge className={cn(
                            "ml-3 flex-shrink-0",
                            pc.type === 'salary'
                              ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                              : "bg-blue-100 text-blue-700 border-blue-200"
                          )}>
                            {TYPE_LABELS[pc.type]}
                          </Badge>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Código + Nombre */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Código *</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="Ej: PA001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Nombre *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ej: Plus Antigüedad"
                />
              </div>
            </div>

            {/* Descripción */}
            <div className="space-y-2">
              <Label className="text-slate-700">Descripción</Label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Descripción del concepto salarial..."
                rows={2}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              />
            </div>

            {/* Tipo + Estado activo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Tipo *</Label>
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as 'salary' | 'non_salary' })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                >
                  <option value="salary">Salarial</option>
                  <option value="non_salary">No Salarial</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-slate-700">Estado</Label>
                <div className="flex items-center gap-3 h-10">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.active}
                      onChange={(e) => setForm({ ...form, active: e.target.checked })}
                      className="accent-[#1B2A41] w-4 h-4"
                    />
                    <span className="text-sm text-slate-700">Concepto activo</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Cotización y tributación */}
            <div className="rounded-lg border border-slate-200 p-4 space-y-4 bg-slate-50/50">
              <h4 className="text-sm font-semibold text-[#1B2A41] flex items-center gap-2">
                <Coins className="w-4 h-4" />
                Cotización y Tributación
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-slate-700">Cotiza a la Seguridad Social</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={form.cotizes_ss}
                        onChange={() => setForm({ ...form, cotizes_ss: true })}
                        className="accent-[#1B2A41]"
                      />
                      <span className="text-sm text-slate-700">Sí</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!form.cotizes_ss}
                        onChange={() => setForm({ ...form, cotizes_ss: false })}
                        className="accent-[#1B2A41]"
                      />
                      <span className="text-sm text-slate-700">No</span>
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700">Tributa IRPF</Label>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={form.tributes_irpf}
                        onChange={() => setForm({ ...form, tributes_irpf: true })}
                        className="accent-[#1B2A41]"
                      />
                      <span className="text-sm text-slate-700">Sí</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        checked={!form.tributes_irpf}
                        onChange={() => setForm({ ...form, tributes_irpf: false })}
                        className="accent-[#1B2A41]"
                      />
                      <span className="text-sm text-slate-700">No</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Fórmula + Convenio */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-slate-700">Fórmula de Cálculo</Label>
                <Input
                  value={form.calculation_formula}
                  onChange={(e) => setForm({ ...form, calculation_formula: e.target.value })}
                  placeholder="Ej: base_salary * 0.05 * years"
                  className="font-mono text-xs"
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

            {/* Educational Tooltip */}
            <div className="space-y-2">
              <Label className="text-slate-700 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-[#C6A664]" />
                Tooltip Educativo
              </Label>
              <textarea
                value={form.educational_tooltip}
                onChange={(e) => setForm({ ...form, educational_tooltip: e.target.value })}
                placeholder="Texto explicativo que se mostrará al pasar el ratón sobre el icono de ayuda. Ideal para explicar la normativa aplicable, límites exentos, etc."
                rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              />
              <p className="text-xs text-slate-400">
                Este texto aparecerá como ayuda contextual junto al nombre del concepto en la tabla.
              </p>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowFormDialog(false)} disabled={isSaving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || !form.code || !form.name || !form.type}
              className="bg-[#1B2A41] hover:bg-[#152036] text-white"
            >
              {isSaving ? 'Guardando...' : editingConcept ? 'Guardar Cambios' : 'Crear Concepto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ────────────────────────────── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">Eliminar Concepto Salarial</DialogTitle>
            <DialogDescription>
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deletingConcept && (
            <div className="py-4">
              <div className="rounded-lg border border-red-100 bg-red-50/50 p-4">
                <p className="text-sm text-slate-700">
                  ¿Estás seguro de que deseas eliminar el concepto{' '}
                  <strong>{deletingConcept.name}</strong> ({deletingConcept.code})?
                </p>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                  <span>Tipo: {TYPE_LABELS[deletingConcept.type]}</span>
                  <span>·</span>
                  <span>Cotiza SS: {deletingConcept.cotizes_ss ? 'Sí' : 'No'}</span>
                  <span>·</span>
                  <span>Tributa IRPF: {deletingConcept.tributes_irpf ? 'Sí' : 'No'}</span>
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
    </div>
  )
}

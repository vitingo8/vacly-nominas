'use client'

import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DigitalTicket } from '@/components/ui/digital-ticket'
import {
  ArrowPathIcon,
  ArrowUturnLeftIcon,
  CalendarDaysIcon,
  DocumentTextIcon,
  SparklesIcon,
  TrashIcon,
  UserIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline'
import { cn } from '@/lib/utils'
import type { Expense } from '@/types/expenses'

const HISTORIAL_LIMIT = 20

const CATEGORIAS = [
  'Material Educativo',
  'Material de Oficina',
  'Nóminas',
  'Alquiler',
  'Servicios',
  'Mantenimiento',
  'Publicidad',
  'Impuestos',
  'Transporte',
  'Comida',
  'Kilómetros',
  'Gasolina',
  'Restaurante',
  'Otro',
]

type DatePreset = 'this_month' | 'last_month' | 'q1' | 'this_year' | 'last_year' | 'custom' | ''

function getPresetRange(preset: DatePreset): { from: string; to: string } | null {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const fmt = (d: Date) => d.toISOString().split('T')[0]

  switch (preset) {
    case 'this_month':
      return { from: fmt(new Date(y, m, 1)), to: fmt(new Date(y, m + 1, 0)) }
    case 'last_month':
      return { from: fmt(new Date(y, m - 1, 1)), to: fmt(new Date(y, m, 0)) }
    case 'q1':
      return { from: `${y}-01-01`, to: `${y}-03-31` }
    case 'this_year':
      return { from: `${y}-01-01`, to: `${y}-12-31` }
    case 'last_year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` }
    default:
      return null
  }
}

interface GastosVerViewProps {
  companyId: string | null
}

export function GastosVerView({ companyId }: GastosVerViewProps) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [historialPage, setHistorialPage] = useState(0)
  const [historialTotal, setHistorialTotal] = useState(0)
  const [filterEmployee, setFilterEmployee] = useState('')
  const [filterDepartment, setFilterDepartment] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showCalendar, setShowCalendar] = useState(false)
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; department?: string }>>([])
  const [departments, setDepartments] = useState<Array<{ id: string; department: string }>>([])
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [showDetailDialog, setShowDetailDialog] = useState(false)

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(value ?? 0)

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return dateString
    }
  }

  const parseExpenseNotes = (expense: Expense) => {
    if (!expense.notes) return null
    try {
      return JSON.parse(expense.notes)
    } catch {
      return { text: expense.notes }
    }
  }

  const loadEmployees = useCallback(async () => {
    if (!companyId) return
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      const supabase = createClient(supabaseUrl, supabaseKey)

      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, first_name, last_name, department')
        .eq('company_id', companyId)

      if (employeesData) {
        setEmployees(employeesData.map((emp: { id: string; first_name?: string; last_name?: string; department?: string }) => ({
          id: emp.id,
          name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Sin nombre',
          department: emp.department,
        })))
      }

      const { data: departmentsData } = await supabase
        .from('departments')
        .select('id, department')
        .eq('company_id', companyId)

      if (departmentsData) {
        setDepartments(departmentsData.map((dept: { id: string; department?: string }) => ({
          id: dept.id,
          department: dept.department || '',
        })))
      }
    } catch {
      /* silenciar */
    }
  }, [companyId])

  const loadExpenses = useCallback(async (page = 0) => {
    if (!companyId) return
    setIsLoading(true)
    try {
      let url = `/api/expenses?company_id=${companyId}&limit=${HISTORIAL_LIMIT}&offset=${page * HISTORIAL_LIMIT}`
      if (filterEmployee) url += `&employee_id=${encodeURIComponent(filterEmployee)}`
      if (filterDepartment) url += `&department=${encodeURIComponent(filterDepartment)}`
      if (filterCategory) url += `&category=${encodeURIComponent(filterCategory)}`
      if (dateFrom) url += `&date_from=${dateFrom}`
      if (dateTo) url += `&date_to=${dateTo}`

      const response = await fetch(url)
      const data = await response.json()
      if (data.success) {
        setExpenses(data.expenses || [])
        setHistorialTotal(data.total || 0)
        setHistorialPage(page)
      }
    } catch (err) {
      console.error('[VER GASTOS] Error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [companyId, filterEmployee, filterDepartment, filterCategory, dateFrom, dateTo])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    if (companyId) loadExpenses(0)
  }, [companyId, filterEmployee, filterDepartment, filterCategory, dateFrom, dateTo])

  const applyPreset = (preset: DatePreset) => {
    setDatePreset(preset)
    if (preset === 'custom') {
      setShowCalendar(true)
      return
    }
    const range = getPresetRange(preset)
    if (range) {
      setDateFrom(range.from)
      setDateTo(range.to)
      setShowCalendar(false)
    } else {
      setDateFrom('')
      setDateTo('')
      setShowCalendar(false)
    }
  }

  const clearFilters = () => {
    setFilterEmployee('')
    setFilterDepartment('')
    setFilterCategory('')
    setDatePreset('')
    setDateFrom('')
    setDateTo('')
    setShowCalendar(false)
  }

  const handleDeleteExpense = async (id: string) => {
    if (!confirm('¿Eliminar este gasto?')) return
    try {
      const res = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) loadExpenses(historialPage)
    } catch (err) {
      console.error('Error eliminando:', err)
    }
  }

  const presetButtons: { key: DatePreset; label: string }[] = [
    { key: 'this_month', label: 'Este mes' },
    { key: 'last_month', label: 'Mes anterior' },
    { key: 'q1', label: '1er trimestre' },
    { key: 'this_year', label: 'Año actual' },
    { key: 'last_year', label: 'Año anterior' },
    { key: 'custom', label: 'Personalizado' },
  ]

  return (
    <div className="w-full min-h-screen bg-transparent">
      <div className="w-full px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center">
              <ArrowUturnLeftIcon className="w-6 h-6 text-[#C6A664]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-[#1B2A41]">Ver Gastos</h1>
              <p className="text-sm text-slate-500">{historialTotal} gastos encontrados</p>
            </div>
          </div>

          {/* Presets de fecha */}
          <div className="flex flex-wrap gap-2 mb-4">
            {presetButtons.map(({ key, label }) => (
              <Button
                key={key}
                variant={datePreset === key ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyPreset(key)}
                className={cn(
                  'text-xs',
                  datePreset === key && 'bg-[#1B2A41] hover:bg-[#152036]'
                )}
              >
                {label}
              </Button>
            ))}
            {(filterEmployee || filterDepartment || filterCategory || dateFrom || dateTo) && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-xs">
                <XMarkIcon className="w-3.5 h-3.5" />
                Limpiar filtros
              </Button>
            )}
          </div>

          {/* Calendario personalizado */}
          {showCalendar && (
            <Card className="p-4 mb-4 border-slate-200">
              <div className="flex items-center gap-2 mb-3">
                <CalendarDaysIcon className="w-5 h-5 text-[#C6A664]" />
                <span className="text-sm font-medium text-slate-700">Seleccionar periodo</span>
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Desde</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-500 mb-1 block">Hasta</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => setShowCalendar(false)}
                  disabled={!dateFrom || !dateTo}
                  className="bg-[#1B2A41] hover:bg-[#152036]"
                >
                  Aplicar
                </Button>
              </div>
            </Card>
          )}

          {/* Filtros adicionales */}
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
            >
              <option value="">Todas las categorías</option>
              {CATEGORIAS.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select
              value={filterEmployee}
              onChange={(e) => setFilterEmployee(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
            >
              <option value="">Todos los empleados</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            <select
              value={filterDepartment}
              onChange={(e) => setFilterDepartment(e.target.value)}
              className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
            >
              <option value="">Todos los departamentos</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.department}>{dept.department}</option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExpenses(historialPage)}
              disabled={isLoading}
              className="gap-2"
            >
              <ArrowPathIcon className={cn('w-4 h-4', isLoading && 'animate-spin')} />
              Actualizar
            </Button>
          </div>
        </div>

        {isLoading && expenses.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C6A664] border-t-transparent" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-xl font-bold text-slate-800 mb-2">Sin gastos</h3>
            <p className="text-slate-500">No hay gastos que coincidan con los filtros seleccionados.</p>
          </div>
        ) : (
          <Card className="overflow-hidden border-slate-200">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50">
                  <TableHead className="font-semibold text-slate-700">Concepto</TableHead>
                  <TableHead className="font-semibold text-slate-700">Categoría</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Fecha</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center">Método</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-right">Importe</TableHead>
                  <TableHead className="font-semibold text-slate-700 text-center w-24">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((expense) => (
                  <TableRow key={expense.id} className="hover:bg-slate-50/50">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {expense.employee_avatar ? (
                          <img src={expense.employee_avatar} alt="" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1B2A41] to-slate-700 flex items-center justify-center">
                            <UserIcon className="w-4 h-4 text-white" />
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          {expense.image && (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                              <SparklesIcon className="w-3 h-3 mr-1" />
                              IA
                            </Badge>
                          )}
                          <span className="font-medium text-slate-800">{expense.concept}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-slate-100 text-slate-700 border-slate-200">{expense.subcategory}</Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600">
                      {formatDate(expense.date || expense.expense_date || '')}
                    </TableCell>
                    <TableCell className="text-center text-sm text-slate-600">{expense.method}</TableCell>
                    <TableCell className="text-right">
                      <span className="text-sm font-mono font-semibold text-red-600">
                        -{formatCurrency(expense.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => { setSelectedExpense(expense); setShowDetailDialog(true) }}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-primary"
                        >
                          <DocumentTextIcon className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteExpense(expense.id)}
                          className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600"
                        >
                          <TrashIcon className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {historialTotal > HISTORIAL_LIMIT && (
          <div className="flex items-center justify-center gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={() => loadExpenses(historialPage - 1)} disabled={historialPage === 0}>
              Anterior
            </Button>
            <span className="text-sm text-slate-600">
              Página {historialPage + 1} de {Math.ceil(historialTotal / HISTORIAL_LIMIT)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadExpenses(historialPage + 1)}
              disabled={(historialPage + 1) * HISTORIAL_LIMIT >= historialTotal}
            >
              Siguiente
            </Button>
          </div>
        )}
      </div>

      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del gasto</DialogTitle>
          </DialogHeader>
          {selectedExpense && (
            <DigitalTicket
              amount={selectedExpense.amount}
              concept={selectedExpense.concept || selectedExpense.description || ''}
              subcategory={selectedExpense.subcategory}
              merchant={parseExpenseNotes(selectedExpense)?.merchant}
              date={selectedExpense.date || selectedExpense.expense_date || ''}
              confidence={parseExpenseNotes(selectedExpense)?.confidence}
              visionAnalysis={parseExpenseNotes(selectedExpense)?.text}
              paymentMethod={selectedExpense.method}
              conceptos={selectedExpense.conceptos || undefined}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

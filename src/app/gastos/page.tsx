'use client'

import { useState, useEffect, useRef } from 'react'
import { 
  Receipt, Upload, Sparkles, PiggyBank, TrendingDown, Wallet,
  LayoutGrid, List, Plus, Calendar, Eye, Trash2, History,
  Download, CheckCircle, AlertCircle, X, Building2, Tag, User,
  RefreshCw, Search, FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ExpenseCard } from '@/components/ui/expense-card'
import { DigitalTicket } from '@/components/ui/digital-ticket'
import { cn } from '@/lib/utils'
import type { Expense, ReceiptAnalysis, ExpenseStats, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '@/types/expenses'

// Categorías de gastos
const categoriasGasto = [
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
  'Otro'
]

// Métodos de pago
const metodosPago = ['Efectivo', 'Tarjeta', 'Transferencia', 'Bizum']

const HISTORIAL_LIMIT = 10

// Valores por defecto si no hay login
const DEFAULT_COMPANY_ID = 'e3605f07-2576-4960-81a5-04184661926d'
const DEFAULT_EMPLOYEE_ID = 'de95edea-9322-494a-a693-61e1ac7337f8'

export default function GastosPage() {
  // Estados principales
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [stats, setStats] = useState<ExpenseStats>({
    totalGastos: 0,
    gastosEsteMes: 0,
    cantidadTotal: 0,
    cantidadEsteMes: 0
  })
  const [isLoading, setIsLoading] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  
  // Estados para análisis IA
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analysisProgress, setAnalysisProgress] = useState(0)
  const [analysisResult, setAnalysisResult] = useState<ReceiptAnalysis | null>(null)
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  
  // Estados para diálogos
  const [showNewExpenseDialog, setShowNewExpenseDialog] = useState(false)
  const [showVerificationDialog, setShowVerificationDialog] = useState(false)
  const [showDetailDialog, setShowDetailDialog] = useState(false)
  const [showImageDialog, setShowImageDialog] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  
  // Estado para nuevo gasto manual
  const [newExpense, setNewExpense] = useState({
    date: new Date().toISOString().split('T')[0],
    concept: '',
    subcategory: categoriasGasto[0],
    amount: 0,
    method: 'Efectivo',
    notes: ''
  })

  // Historial
  const [historialPage, setHistorialPage] = useState(0)
  const [historialTotal, setHistorialTotal] = useState(0)
  
  // Filtros
  const [filterEmployee, setFilterEmployee] = useState<string>('')
  const [filterDepartment, setFilterDepartment] = useState<string>('')
  const [filterMonth, setFilterMonth] = useState<string>('')
  const [employees, setEmployees] = useState<Array<{id: string, name: string, department?: string}>>([])
  const [departments, setDepartments] = useState<Array<{id: string, department: string}>>([])
  
  // Detectar modo desde query params (employee = trabajador, global = gestor)
  const [viewModeType, setViewModeType] = useState<'employee' | 'global'>('global')
  const [autoEmployeeId, setAutoEmployeeId] = useState<string | null>(null)
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Leer parámetros de la URL al montar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const mode = params.get('mode') || 'global'
    const employeeId = params.get('employee_id')
    const companyId = params.get('company_id')
    
    setViewModeType(mode === 'employee' ? 'employee' : 'global')
    
    // Si es modo trabajador, aplicar filtro automático
    if (mode === 'employee' && employeeId) {
      setAutoEmployeeId(employeeId)
      setFilterEmployee(employeeId) // Aplicar filtro automáticamente
    }
    
    console.log(`[FRONTEND GASTOS] 🔍 Modo detectado: ${mode}, Employee ID: ${employeeId}, Company ID: ${companyId}`)
  }, [])

  // Formatear moneda
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(value ?? 0)

  // Formatear fecha
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString)
      return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return dateString
    }
  }


  // Cargar gastos
  const loadExpenses = async (page = 0) => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [FRONTEND GASTOS] 📥 Cargando gastos - página ${page}`)
    setIsLoading(true)
    try {
      // TODO: En producción obtener del contexto de usuario
      const companyId = DEFAULT_COMPANY_ID
      let url = `/api/expenses?company_id=${companyId}&limit=${HISTORIAL_LIMIT}&offset=${page * HISTORIAL_LIMIT}`
      
      // En modo trabajador, siempre filtrar por employee_id
      const employeeIdToUse = viewModeType === 'employee' && autoEmployeeId 
        ? autoEmployeeId 
        : filterEmployee
      
      // Añadir filtros
      if (employeeIdToUse) url += `&employee_id=${encodeURIComponent(employeeIdToUse)}`
      if (filterDepartment && viewModeType === 'global') url += `&department=${encodeURIComponent(filterDepartment)}`
      if (filterMonth) {
        const [year, month] = filterMonth.split('-')
        url += `&year=${year}&month=${month}`
      }
      
      console.log(`[${timestamp}] [FRONTEND GASTOS] 🔍 URL con filtros:`, url)
      console.log(`[${timestamp}] [FRONTEND GASTOS] 🏢 Company ID:`, companyId)
      console.log(`[${timestamp}] [FRONTEND GASTOS] 👤 Modo:`, viewModeType, 'Employee ID:', employeeIdToUse)
      
      const response = await fetch(url)
      console.log(`[${timestamp}] [FRONTEND GASTOS] 📥 Respuesta recibida:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })
      
      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        try {
          const errorData = await response.text()
          console.error(`[${timestamp}] [FRONTEND GASTOS] ❌ Error HTTP body:`, errorData.substring(0, 200))
          try {
            const parsedError = JSON.parse(errorData)
            errorMessage = parsedError.error || parsedError.message || errorMessage
          } catch {
            // Si no es JSON, usar el texto como está
          }
        } catch (e) {
          console.error(`[${timestamp}] [FRONTEND GASTOS] ❌ Error leyendo respuesta de error:`, e)
        }
        throw new Error(errorMessage)
      }
      
      const data = await response.json()
      console.log(`[${timestamp}] [FRONTEND GASTOS] 📦 Datos recibidos:`, {
        success: data.success,
        expensesCount: data.expenses?.length || 0,
        total: data.total,
        stats: data.stats
      })
      
      if (data.success) {
        const expensesList = data.expenses || []
        setExpenses(expensesList)
        setStats(data.stats || {
          totalGastos: 0,
          gastosEsteMes: 0,
          cantidadTotal: 0,
          cantidadEsteMes: 0
        })
        setHistorialTotal(data.total || 0)
        setHistorialPage(page)
        console.log(`[${timestamp}] [FRONTEND GASTOS] ✅ Gastos cargados exitosamente`)
        
        // Los avatares ya vienen en la respuesta de la API (employee_avatar)
        console.log(`[${timestamp}] [FRONTEND GASTOS] 👤 Avatares incluidos en respuesta de API`)
      } else {
        console.error(`[${timestamp}] [FRONTEND GASTOS] ❌ Error en respuesta:`, data.error, data.details)
      }
    } catch (error) {
      const errorTimestamp = new Date().toISOString()
      console.error(`[${errorTimestamp}] [FRONTEND GASTOS] ❌ ERROR cargando gastos:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Cargar empleados y departamentos
  useEffect(() => {
    const loadEmployeesAndDepartments = async () => {
      const companyId = DEFAULT_COMPANY_ID
      try {
        // Cargar empleados desde Supabase directamente
        const { createClient } = await import('@supabase/supabase-js')
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
        const supabase = createClient(supabaseUrl, supabaseKey)
        
        const { data: employeesData } = await supabase
          .from('employees')
          .select('id, first_name, last_name, department')
          .eq('company_id', companyId)
        
        if (employeesData) {
          setEmployees(employeesData.map((emp: any) => ({
            id: emp.id,
            name: `${emp.first_name || ''} ${emp.last_name || ''}`.trim() || 'Sin nombre',
            department: emp.department
          })))
        }
        
        const { data: departmentsData } = await supabase
          .from('departments')
          .select('id, department')
          .eq('company_id', companyId)
        
        if (departmentsData) {
          setDepartments(departmentsData.map((dept: any) => ({
            id: dept.id,
            department: dept.department || dept.name
          })))
        }
      } catch (error) {
        console.error('Error cargando empleados/departamentos:', error)
      }
    }
    loadEmployeesAndDepartments()
  }, [])

  useEffect(() => {
    loadExpenses(historialPage)
  }, [filterEmployee, filterDepartment, filterMonth, viewModeType, autoEmployeeId])

  useEffect(() => {
    loadExpenses()
  }, [])

  // Manejar click en botón de captura IA
  const handleCameraClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click()
    }
  }

  // Manejar selección de archivo
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar que sea una imagen
    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecciona una imagen válida')
      return
    }

    setIsAnalyzing(true)
    setAnalysisProgress(10)

    // Convertir a base64 para preview
    const reader = new FileReader()
    reader.onload = async () => {
      const base64 = reader.result as string
      setCurrentImage(base64)
      setAnalysisProgress(30)

      try {
        // Enviar a API de análisis
        const response = await fetch('/api/expenses/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageData: base64,
            mediaType: file.type
          })
        })

        setAnalysisProgress(80)
        const result = await response.json()

        if (result.success) {
          setAnalysisResult(result.data)
          setShowVerificationDialog(true)
          setAnalysisProgress(100)
        } else {
          alert(`Error: ${result.error || 'No se pudo analizar la imagen'}`)
        }
      } catch (error) {
        console.error('Error analizando imagen:', error)
        alert('Error al analizar la imagen. Por favor, intenta de nuevo.')
      } finally {
        setIsAnalyzing(false)
        setAnalysisProgress(0)
      }
    }
    reader.readAsDataURL(file)

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Guardar gasto desde verificación IA
  const handleSaveFromVerification = async () => {
    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [FRONTEND GASTOS] 💾 Guardando gasto desde verificación IA`)
    
    if (!analysisResult) {
      console.error(`[${timestamp}] [FRONTEND GASTOS] ❌ No hay analysisResult`)
      return
    }

    setIsLoading(true)
    try {
      // TODO: En producción obtener del contexto de usuario
      const companyId = DEFAULT_COMPANY_ID
      const employeeId = DEFAULT_EMPLOYEE_ID
      
      // Preparar conceptos desde items si existen
      const conceptos: any = {
        items: analysisResult.items && analysisResult.items.length > 0
          ? analysisResult.items.map((item: any) => ({
              name: item.name || '',
              quantity: item.quantity || 1,
              unitPrice: item.unitPrice || 0,
              total: item.total || 0
            }))
          : [],
        taxes: analysisResult.taxes ? {
          subtotal: analysisResult.taxes.subtotal || null,
          iva: analysisResult.taxes.iva || null,
          ivaPercentage: analysisResult.taxes.ivaPercentage || null
        } : null
      }

      const expenseData = {
        company_id: companyId,
        employee_id: employeeId,
        date: analysisResult.date || new Date().toISOString().split('T')[0],
        concept: analysisResult.concept,
        category: 'Gasto',
        subcategory: analysisResult.subcategory,
        amount: analysisResult.amount,
        method: newExpense.method,
        image: currentImage,
        conceptos: conceptos.items.length > 0 || conceptos.taxes ? conceptos : undefined,
        notes: JSON.stringify({
          text: analysisResult.notes,
          merchant: analysisResult.merchant,
          confidence: analysisResult.confidence,
          visionAnalysis: analysisResult.rawAnalysis,
          analyzedAt: new Date().toISOString()
        })
      }

      console.log(`[${timestamp}] [FRONTEND GASTOS] 📦 Datos a enviar:`, {
        company_id: expenseData.company_id,
        date: expenseData.date,
        concept: expenseData.concept?.substring(0, 50),
        amount: expenseData.amount,
        hasImage: !!expenseData.image
      })

      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseData)
      })

      console.log(`[${timestamp}] [FRONTEND GASTOS] 📥 Respuesta POST:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })

      const result = await response.json()
      console.log(`[${timestamp}] [FRONTEND GASTOS] 📦 Resultado:`, {
        success: result.success,
        error: result.error,
        details: result.details
      })

      if (result.success) {
        console.log(`[${timestamp}] [FRONTEND GASTOS] ✅ Gasto guardado exitosamente`)
        setShowVerificationDialog(false)
        setAnalysisResult(null)
        setCurrentImage(null)
        await loadExpenses(historialPage)
      } else {
        console.error(`[${timestamp}] [FRONTEND GASTOS] ❌ Error guardando:`, result.error, result.details)
        alert(`Error: ${result.error || 'No se pudo guardar el gasto'}`)
      }
    } catch (error) {
      const errorTimestamp = new Date().toISOString()
      console.error(`[${errorTimestamp}] [FRONTEND GASTOS] ❌ ERROR guardando gasto:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      })
      alert('Error al guardar el gasto. Por favor, intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  // Guardar gasto manual
  const handleSaveManual = async () => {
    if (!newExpense.concept || newExpense.amount <= 0) {
      alert('Por favor completa todos los campos obligatorios.')
      return
    }

    setIsLoading(true)
    try {
      // TODO: En producción obtener del contexto de usuario
      const companyId = DEFAULT_COMPANY_ID
      const employeeId = DEFAULT_EMPLOYEE_ID

      const expenseData = {
        company_id: companyId,
        employee_id: employeeId,
        date: newExpense.date,
        concept: newExpense.concept,
        category: 'Gasto',
        subcategory: newExpense.subcategory,
        amount: newExpense.amount,
        method: newExpense.method,
        notes: newExpense.notes ? JSON.stringify({ text: newExpense.notes }) : null
      }

      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(expenseData)
      })

      const result = await response.json()

      if (result.success) {
        setShowNewExpenseDialog(false)
        setNewExpense({
          date: new Date().toISOString().split('T')[0],
          concept: '',
          subcategory: categoriasGasto[0],
          amount: 0,
          method: 'Efectivo',
          notes: ''
        })
        await loadExpenses(historialPage)
      } else {
        alert(`Error: ${result.error || 'No se pudo guardar el gasto'}`)
      }
    } catch (error) {
      console.error('Error guardando gasto:', error)
      alert('Error al guardar el gasto. Por favor, intenta de nuevo.')
    } finally {
      setIsLoading(false)
    }
  }

  // Eliminar gasto
  const handleDeleteExpense = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este gasto?')) return

    const timestamp = new Date().toISOString()
    console.log(`[${timestamp}] [FRONTEND GASTOS] 🗑️ Eliminando gasto:`, id)

    try {
      const response = await fetch(`/api/expenses?id=${id}`, { method: 'DELETE' })
      console.log(`[${timestamp}] [FRONTEND GASTOS] 📥 Respuesta DELETE:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      })

      const result = await response.json()
      console.log(`[${timestamp}] [FRONTEND GASTOS] 📦 Resultado DELETE:`, {
        success: result.success,
        error: result.error
      })

      if (result.success) {
        console.log(`[${timestamp}] [FRONTEND GASTOS] ✅ Gasto eliminado, recargando lista...`)
        await loadExpenses(historialPage) // Mantener la página actual
      } else {
        console.error(`[${timestamp}] [FRONTEND GASTOS] ❌ Error eliminando:`, result.error, result.details)
        alert(`Error: ${result.error || 'No se pudo eliminar el gasto'}`)
      }
    } catch (error) {
      const errorTimestamp = new Date().toISOString()
      console.error(`[${errorTimestamp}] [FRONTEND GASTOS] ❌ ERROR eliminando gasto:`, {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      })
      alert('Error al eliminar el gasto.')
    }
  }

  // Ver detalle de gasto
  const handleViewExpense = (expense: Expense) => {
    setSelectedExpense(expense)
    setShowDetailDialog(true)
  }

  // Parsear notas de un gasto
  const parseExpenseNotes = (expense: Expense) => {
    if (!expense.notes) return null
    try {
      return JSON.parse(expense.notes)
    } catch {
      return { text: expense.notes }
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full px-4 md:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          {/* Gastos Este Mes */}
          <Card className="relative overflow-hidden rounded-3xl border border-slate-200/50 bg-white/80 shadow-xl backdrop-blur-md">
            <div className="absolute inset-0 bg-gradient-to-br from-red-500/10 via-red-400/5 to-orange-400/10 opacity-70" />
            <CardHeader className="relative z-10 pb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg">
                  <TrendingDown className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-700">Gastos Este Mes</CardTitle>
                  <p className="text-sm text-slate-500">{stats.cantidadEsteMes} gastos registrados</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-4xl font-bold text-red-600 tabular-nums">
                {formatCurrency(stats.gastosEsteMes)}
              </div>
            </CardContent>
          </Card>

          {/* Total Gastos */}
          <Card className="relative overflow-hidden rounded-3xl border border-slate-200/50 bg-white/80 shadow-xl backdrop-blur-md">
            <div className="absolute inset-0 bg-gradient-to-br from-[#1B2A41]/10 via-slate-400/5 to-[#C6A664]/10 opacity-70" />
            <CardHeader className="relative z-10 pb-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#1B2A41] to-[#C6A664] shadow-lg">
                  <Wallet className="h-6 w-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg font-semibold text-slate-700">Total Gastos</CardTitle>
                  <p className="text-sm text-slate-500">{stats.cantidadTotal} gastos en total</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-4xl font-bold text-[#1B2A41] tabular-nums">
                {formatCurrency(stats.totalGastos)}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Botones de Acción */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <Button
            onClick={handleCameraClick}
            disabled={isAnalyzing}
            className="flex-1 h-16 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg rounded-2xl text-lg font-semibold"
          >
            {isAnalyzing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent mr-3" />
                Analizando... {analysisProgress}%
              </>
            ) : (
              <>
                <Sparkles className="w-6 h-6 mr-3" />
                Gasto con IA
              </>
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            onClick={() => setShowNewExpenseDialog(true)}
            variant="outline"
            className="flex-1 h-16 border-2 border-[#1B2A41] text-[#1B2A41] hover:bg-[#1B2A41] hover:text-white rounded-2xl text-lg font-semibold"
          >
            <Plus className="w-6 h-6 mr-3" />
            Nuevo Gasto Manual
          </Button>
        </div>

        {/* Barra de progreso de análisis */}
        {isAnalyzing && (
          <div className="mb-8">
            <Progress value={analysisProgress} variant="gold" className="h-2" />
            <p className="text-sm text-slate-600 mt-2 text-center">
              Claude Vision está analizando el ticket...
            </p>
          </div>
        )}

        {/* Control de Vista */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-[#1B2A41]">
            Gastos Recientes
          </h2>
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('grid')}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === 'grid' ? "bg-white shadow-sm text-[#1B2A41]" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "p-2 rounded-md transition-colors",
                viewMode === 'list' ? "bg-white shadow-sm text-[#1B2A41]" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <List className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Lista/Grid de Gastos */}
        {isLoading && expenses.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#C6A664] border-t-transparent" />
          </div>
        ) : expenses.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5 flex items-center justify-center mx-auto mb-4">
              <Receipt className="w-10 h-10 text-[#C6A664]/50" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Sin gastos</h3>
            <p className="text-slate-500 max-w-md mx-auto">
              Comienza registrando tu primer gasto usando el botón "Gasto con IA" o crea uno manualmente.
            </p>
          </div>
        ) : (
          <div
            className={cn(
              "w-full",
              viewMode === 'grid'
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-4"
                : "flex flex-col gap-2"
            )}
          >
            {expenses.map((expense) => (
              <ExpenseCard
                key={expense.id}
                expense={expense}
                compact={viewMode === 'list'}
                employeeAvatar={expense.employee_avatar || null}
                onView={() => handleViewExpense(expense)}
                onViewImage={() => {
                  if (expense.image) {
                    setSelectedImage(expense.image)
                    setShowImageDialog(true)
                  }
                }}
                onDelete={() => handleDeleteExpense(expense.id)}
              />
            ))}
          </div>
        )}

        {/* Historial */}
        <div className="mt-12">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center">
                  <History className="w-6 h-6 text-[#C6A664]" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#1B2A41]">Historial de Gastos</h2>
                  <p className="text-sm text-slate-500">{historialTotal} gastos procesados</p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadExpenses(historialPage)}
                disabled={isLoading}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                Actualizar
              </Button>
            </div>
            
            {/* Filtros - Solo mostrar en modo global */}
            {viewModeType === 'global' && (
              <div className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
                <select
                  value={filterEmployee}
                  onChange={(e) => setFilterEmployee(e.target.value)}
                  className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664] focus:border-transparent"
                >
                  <option value="">Todos los empleados</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name}
                    </option>
                  ))}
                </select>
                <select
                  value={filterDepartment}
                  onChange={(e) => setFilterDepartment(e.target.value)}
                  className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664] focus:border-transparent"
                >
                  <option value="">Todos los departamentos</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.department}>
                      {dept.department}
                    </option>
                  ))}
                </select>
                <select
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="h-9 px-3 rounded-md border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664] focus:border-transparent"
                >
                  <option value="">Todos los meses</option>
                  {Array.from({ length: 12 }, (_, i) => {
                    const date = new Date()
                    date.setMonth(date.getMonth() - i)
                    const month = String(date.getMonth() + 1).padStart(2, '0')
                    const year = date.getFullYear()
                    return `${year}-${month}`
                  }).map((monthValue) => {
                    const [year, month] = monthValue.split('-')
                    const date = new Date(parseInt(year), parseInt(month) - 1)
                    return (
                      <option key={monthValue} value={monthValue}>
                        {date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                      </option>
                    )
                  })}
                </select>
                {(filterEmployee || filterDepartment || filterMonth) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterEmployee('')
                      setFilterDepartment('')
                      setFilterMonth('')
                    }}
                    className="h-9 gap-1"
                  >
                    <X className="w-4 h-4" />
                    Limpiar
                  </Button>
                )}
              </div>
            )}
            
            {/* Mensaje informativo en modo trabajador */}
            {viewModeType === 'employee' && (
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 mb-4">
                <p className="text-sm text-blue-700">
                  📋 Mostrando solo tus gastos personales. Los filtros están deshabilitados en esta vista.
                </p>
              </div>
            )}
          </div>

          {expenses.length > 0 && (
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
                            <img
                              src={expense.employee_avatar}
                              alt="Avatar empleado"
                              className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-slate-200"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1B2A41] to-slate-700 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4 text-white" />
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {expense.image && (
                              <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">
                                <Sparkles className="w-3 h-3 mr-1" />
                                IA
                              </Badge>
                            )}
                            <span className="font-medium text-slate-800">{expense.concept}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                          {expense.subcategory}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-sm text-slate-600">
                        {formatDate(expense.date)}
                      </TableCell>
                      <TableCell className="text-center text-sm text-slate-600">
                        {expense.method}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono font-semibold text-red-600">
                            -{formatCurrency(expense.amount)}
                          </span>
                          {expense.conceptos && typeof expense.conceptos === 'object' && !Array.isArray(expense.conceptos) && expense.conceptos.taxes && expense.conceptos.taxes.iva && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              IVA {expense.conceptos.taxes.ivaPercentage ? `(${expense.conceptos.taxes.ivaPercentage}%)` : ''}: {formatCurrency(expense.conceptos.taxes.iva)}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewExpense(expense)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                            title="Ver ticket digital"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteExpense(expense.id)}
                            className="h-7 w-7 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                            title="Eliminar"
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

          {/* Paginación */}
          {historialTotal > HISTORIAL_LIMIT && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadExpenses(historialPage - 1)}
                disabled={historialPage === 0}
              >
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
      </div>

      {/* Dialog de nuevo gasto manual */}
      <Dialog open={showNewExpenseDialog} onOpenChange={setShowNewExpenseDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">Nuevo Gasto Manual</DialogTitle>
            <DialogDescription>
              Registra un gasto manualmente sin usar el análisis IA
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Fecha</label>
                <Input
                  type="date"
                  value={newExpense.date}
                  onChange={(e) => setNewExpense({ ...newExpense, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Importe (€)</label>
                <Input
                  type="number"
                  step="0.01"
                  value={newExpense.amount || ''}
                  onChange={(e) => setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Concepto</label>
              <Input
                value={newExpense.concept}
                onChange={(e) => setNewExpense({ ...newExpense, concept: e.target.value })}
                placeholder="Describe el gasto..."
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Categoría</label>
                <select
                  value={newExpense.subcategory}
                  onChange={(e) => setNewExpense({ ...newExpense, subcategory: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                >
                  {categoriasGasto.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">Método de Pago</label>
                <select
                  value={newExpense.method}
                  onChange={(e) => setNewExpense({ ...newExpense, method: e.target.value })}
                  className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                >
                  {metodosPago.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">Notas (opcional)</label>
              <textarea
                value={newExpense.notes}
                onChange={(e) => setNewExpense({ ...newExpense, notes: e.target.value })}
                placeholder="Añade observaciones..."
                rows={3}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowNewExpenseDialog(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveManual}
                disabled={isLoading || !newExpense.concept || newExpense.amount <= 0}
                className="bg-[#1B2A41] hover:bg-[#152036]"
              >
                {isLoading ? 'Guardando...' : 'Guardar Gasto'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de verificación IA */}
      <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">Verificar Análisis IA</DialogTitle>
            <DialogDescription>
              Revisa y confirma los datos extraídos automáticamente del ticket
            </DialogDescription>
          </DialogHeader>

          {analysisResult && (
            <div className="space-y-6 mt-4">
              {/* Ticket Digital */}
              <div className="max-h-[400px] overflow-y-auto">
                <DigitalTicket
                  amount={analysisResult.amount}
                  concept={analysisResult.concept}
                  subcategory={analysisResult.subcategory}
                  merchant={analysisResult.merchant}
                  date={analysisResult.date}
                  confidence={analysisResult.confidence}
                  visionAnalysis={analysisResult.notes}
                  time={analysisResult.time}
                  items={analysisResult.items}
                  taxes={analysisResult.taxes}
                  paymentMethod={analysisResult.paymentMethod}
                  ticketNumber={analysisResult.ticketNumber}
                />
              </div>

              {/* Campos editables */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Categoría</label>
                    <select
                      value={analysisResult.subcategory}
                      onChange={(e) => setAnalysisResult({ ...analysisResult, subcategory: e.target.value })}
                      className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                    >
                      {categoriasGasto.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 mb-2 block">Importe (€)</label>
                    <Input
                      type="number"
                      step="0.01"
                      value={analysisResult.amount}
                      onChange={(e) => setAnalysisResult({ ...analysisResult, amount: parseFloat(e.target.value) || 0 })}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Concepto</label>
                  <Input
                    value={analysisResult.concept}
                    onChange={(e) => setAnalysisResult({ ...analysisResult, concept: e.target.value })}
                  />
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700 mb-2 block">Método de Pago</label>
                  <select
                    value={newExpense.method}
                    onChange={(e) => setNewExpense({ ...newExpense, method: e.target.value })}
                    className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C6A664]"
                  >
                    {metodosPago.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowVerificationDialog(false)
                    setAnalysisResult(null)
                    setCurrentImage(null)
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleSaveFromVerification}
                  disabled={isLoading}
                  className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  {isLoading ? 'Guardando...' : 'Confirmar y Guardar'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de imagen ampliada */}
      <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">Imagen del Ticket</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="mt-4">
              <img
                src={selectedImage}
                alt="Ticket original"
                className="w-full h-auto rounded-lg border shadow-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de detalle de gasto */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-[#1B2A41]">Detalle del Gasto</DialogTitle>
          </DialogHeader>

          {selectedExpense && (
            <div className="space-y-6 mt-4">
              {/* Si tiene imagen, mostrar ticket digital */}
              {selectedExpense.image ? (
                <DigitalTicket
                  amount={selectedExpense.amount}
                  concept={selectedExpense.concept}
                  subcategory={selectedExpense.subcategory}
                  merchant={parseExpenseNotes(selectedExpense)?.merchant}
                  date={selectedExpense.date}
                  confidence={parseExpenseNotes(selectedExpense)?.confidence}
                  visionAnalysis={parseExpenseNotes(selectedExpense)?.text}
                  paymentMethod={selectedExpense.method}
                  conceptos={selectedExpense.conceptos || undefined}
                />
              ) : (
                <Card>
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="flex items-center gap-3 pb-4 border-b">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#1B2A41] to-slate-700 flex items-center justify-center">
                          <Receipt className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-lg text-slate-800">{selectedExpense.concept}</h3>
                          <p className="text-sm text-slate-500">{selectedExpense.subcategory}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-medium">Fecha</p>
                          <p className="text-sm font-semibold text-slate-800">{formatDate(selectedExpense.date)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-slate-500 uppercase font-medium">Método de Pago</p>
                          <p className="text-sm font-semibold text-slate-800">{selectedExpense.method}</p>
                        </div>
                      </div>

                      <div className="pt-4 border-t">
                        <p className="text-xs text-slate-500 uppercase font-medium mb-2">Importe</p>
                        <p className="text-3xl font-bold text-red-600">{formatCurrency(selectedExpense.amount)}</p>
                      </div>

                      {parseExpenseNotes(selectedExpense)?.text && (
                        <div className="pt-4 border-t">
                          <p className="text-xs text-slate-500 uppercase font-medium mb-2">Notas</p>
                          <p className="text-sm text-slate-700">{parseExpenseNotes(selectedExpense)?.text}</p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Imagen original si existe */}
              {selectedExpense.image && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-slate-700">Imagen Original</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowDetailDialog(false)
                        setSelectedImage(selectedExpense.image!)
                        setShowImageDialog(true)
                      }}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Ver más grande
                    </Button>
                  </div>
                  <img
                    src={selectedExpense.image}
                    alt="Ticket original"
                    className="w-full max-h-[300px] object-contain rounded-lg border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => {
                      setShowDetailDialog(false)
                      setSelectedImage(selectedExpense.image!)
                      setShowImageDialog(true)
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}


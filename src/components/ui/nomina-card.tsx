'use client'

import * as React from "react"
import { cn } from "@/lib/utils"
import { 
  User, 
  Building2, 
  TrendingUp, 
  CreditCard, 
  Calendar,
  CheckCircle,
  Clock,
  Brain,
  Loader2,
  Eye,
  Download,
  ChevronRight
} from 'lucide-react'

interface NominaData {
  id: string
  nominaId: string
  period_start: string
  period_end: string
  employee: {
    name?: string
    dni?: string
    nss?: string
    category?: string
    code?: string
  }
  company: {
    name?: string
    cif?: string
    address?: string
    center_code?: string
  }
  perceptions: Array<{
    code?: string
    concept?: string
    amount?: number
  }>
  deductions: Array<{
    code?: string
    concept?: string
    amount?: number
  }>
  contributions: Array<{
    concept?: string
    base?: number
    rate?: number
    employer_contribution?: number
  }>
  base_ss: number
  net_pay: number
  gross_salary?: number
  iban?: string
  swift_bic?: string
  cost_empresa: number
  signed: boolean
}

interface SplitDocument {
  id: string
  filename: string
  pageNumber: number
  textContent: string
  pdfUrl: string
  textUrl: string
  claudeProcessed?: boolean
  nominaData?: NominaData
}

interface NominaCardProps {
  document: SplitDocument
  isSelected?: boolean
  isProcessing?: boolean
  compact?: boolean
  onSelect?: () => void
  onProcess?: () => void
  onView?: () => void
  onDownload?: () => void
}

export function NominaCard({
  document,
  isSelected = false,
  isProcessing = false,
  compact = false,
  onSelect,
  onProcess,
  onView,
  onDownload
}: NominaCardProps) {
  const { nominaData, claudeProcessed, pageNumber, filename } = document
  
  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '—'
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(amount)
  }

  const formatPeriod = (start?: string, end?: string) => {
    if (!start) return 'Sin período'
    try {
      const date = new Date(start)
      return date.toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }).toUpperCase()
    } catch {
      return start
    }
  }

  const getRetentionRate = () => {
    if (!nominaData?.gross_salary || !nominaData?.net_pay) return null
    const retention = ((nominaData.gross_salary - nominaData.net_pay) / nominaData.gross_salary) * 100
    return retention.toFixed(1)
  }

  // Versión compacta para modo lista
  if (compact) {
    if (!claudeProcessed || !nominaData) {
      return (
        <div
          onClick={onSelect}
          className={cn(
            "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
            "bg-white border-2 hover:border-[#C6A664]",
            isSelected ? "border-[#C6A664] bg-[#C6A664]/5" : "border-slate-200"
          )}
        >
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
            <Clock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-700 truncate">Página {pageNumber}</p>
            <p className="text-xs text-slate-500 truncate">{filename}</p>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-[#C6A664]/10 text-[#C6A664] border border-[#C6A664]/20 flex-shrink-0">
            Pendiente
          </span>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onView?.()
              }}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              title="Ver documento"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onProcess?.()
              }}
              disabled={isProcessing}
              className="p-1.5 rounded-lg bg-[#1B2A41] text-white hover:bg-[#152036] transition-colors"
              title="Procesar con IA"
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Brain className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      )
    }

    return (
      <div
        onClick={onSelect}
        className={cn(
          "flex items-center gap-4 p-3 rounded-lg cursor-pointer transition-all",
          "bg-white border-2 hover:border-emerald-300 hover:shadow-md",
          isSelected ? "border-emerald-500 bg-emerald-50/50" : "border-slate-200"
        )}
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
          <User className="w-5 h-5 text-white" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-bold text-slate-800 truncate">
              {nominaData.employee?.name || 'Empleado'}
            </p>
            <span className="px-1.5 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1 flex-shrink-0">
              <CheckCircle className="w-3 h-3" />
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span className="truncate">{nominaData.company?.name || 'Empresa'}</span>
            <span>•</span>
            <span>{formatPeriod(nominaData.period_start)}</span>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-shrink-0">
          <div className="text-right">
            <p className="text-xs text-slate-500 mb-0.5">Bruto</p>
            <p className="text-sm font-bold text-[#1B2A41] tabular-nums">{formatCurrency(nominaData.gross_salary)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 mb-0.5">Neto</p>
            <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatCurrency(nominaData.net_pay)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 mb-0.5">Coste</p>
            <p className="text-sm font-bold text-[#C6A664] tabular-nums">{formatCurrency(nominaData.cost_empresa)}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onView?.()
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDownload?.()
            }}
            className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  // Card sin procesar
  if (!claudeProcessed || !nominaData) {
    return (
      <div
        onClick={onSelect}
        className={cn(
          "group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300",
          "bg-gradient-to-br from-slate-50 to-slate-100 border-2",
          "hover:shadow-xl hover:scale-[1.02] hover:border-[#C6A664]",
          isSelected ? "border-[#C6A664] shadow-lg ring-2 ring-[#C6A664]/20" : "border-slate-200"
        )}
      >
        {/* Header mínimo */}
        <div className="p-4 pb-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                <Clock className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Página {pageNumber}</p>
                <p className="text-xs text-slate-500 truncate max-w-[140px]">{filename}</p>
              </div>
            </div>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-[#C6A664]/10 text-[#C6A664] border border-[#C6A664]/20">
              Pendiente
            </span>
          </div>
          
          {/* Mensaje pendiente */}
          <div className="bg-[#1B2A41]/5 rounded-xl p-3 border border-[#C6A664]/20">
            <p className="text-xs text-[#1B2A41] text-center">
              ⏳ Haz clic en <strong>Procesar</strong> para extraer los datos
            </p>
          </div>
        </div>

        {/* Botón de procesar */}
        <div className="p-3 pt-0">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onProcess?.()
            }}
            disabled={isProcessing}
            className={cn(
              "w-full py-2.5 rounded-xl font-semibold text-sm transition-all",
              "flex items-center justify-center gap-2",
              isProcessing 
                ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                : "bg-gradient-to-r from-[#1B2A41] to-[#2d4057] text-white hover:from-[#152036] hover:to-[#1B2A41] shadow-md hover:shadow-lg"
            )}
          >
            {isProcessing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Procesando...
              </>
            ) : (
              <>
                <Brain className="w-4 h-4" />
                Procesar con IA
              </>
            )}
          </button>
        </div>
      </div>
    )
  }

  // Card procesada con KPIs
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300",
        "bg-white border-2",
        "hover:shadow-2xl hover:scale-[1.02]",
        isSelected 
          ? "border-emerald-500 shadow-xl ring-2 ring-emerald-200" 
          : "border-slate-200 hover:border-emerald-300"
      )}
    >
      {/* Gradient accent top */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
      
      {/* Header con empleado */}
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg">
              <User className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-800 truncate leading-tight">
                {nominaData.employee?.name || 'Empleado'}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 truncate">
                  {nominaData.employee?.dni || '—'}
                </span>
                {nominaData.employee?.category && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="text-xs text-slate-500 truncate">
                      {nominaData.employee.category}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
              <CheckCircle className="w-3 h-3" />
              OK
            </span>
          </div>
        </div>

        {/* Company & Period */}
        <div className="flex items-center gap-3 mb-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate max-w-[100px]">{nominaData.company?.name || 'Empresa'}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>{formatPeriod(nominaData.period_start)}</span>
          </div>
        </div>
      </div>

      {/* KPIs Grid */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-2 gap-2">
          {/* Salario Bruto */}
          <div className="bg-gradient-to-br from-[#C6A664]/10 to-[#B8964A]/10 rounded-xl p-3 border border-[#C6A664]/20">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded-md bg-[#C6A664]/10 flex items-center justify-center">
                <TrendingUp className="w-3 h-3 text-[#C6A664]" />
              </div>
              <span className="text-[10px] font-medium text-[#1B2A41] uppercase tracking-wide">Bruto</span>
            </div>
            <p className="text-lg font-bold text-[#1B2A41] tabular-nums">
              {formatCurrency(nominaData.gross_salary)}
            </p>
          </div>

          {/* Salario Neto */}
          <div className="bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl p-3 border border-emerald-100">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded-md bg-emerald-500/10 flex items-center justify-center">
                <CreditCard className="w-3 h-3 text-emerald-600" />
              </div>
              <span className="text-[10px] font-medium text-emerald-700 uppercase tracking-wide">Neto</span>
            </div>
            <p className="text-lg font-bold text-emerald-900 tabular-nums">
              {formatCurrency(nominaData.net_pay)}
            </p>
          </div>

          {/* Coste Empresa */}
          <div className="bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5 rounded-xl p-3 border border-[#C6A664]/20">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded-md bg-[#C6A664]/10 flex items-center justify-center">
                <Building2 className="w-3 h-3 text-[#C6A664]" />
              </div>
              <span className="text-[10px] font-medium text-[#1B2A41] uppercase tracking-wide">Coste Emp.</span>
            </div>
            <p className="text-lg font-bold text-[#1B2A41] tabular-nums">
              {formatCurrency(nominaData.cost_empresa)}
            </p>
          </div>

          {/* Retención */}
          <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-xl p-3 border border-rose-100">
            <div className="flex items-center gap-1.5 mb-1">
              <div className="w-5 h-5 rounded-md bg-rose-500/10 flex items-center justify-center">
                <span className="text-[10px] font-bold text-rose-600">%</span>
              </div>
              <span className="text-[10px] font-medium text-rose-700 uppercase tracking-wide">Retención</span>
            </div>
            <p className="text-lg font-bold text-rose-900 tabular-nums">
              {getRetentionRate() ? `${getRetentionRate()}%` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Actions footer */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onView?.()
            }}
            className="flex-1 py-2 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors flex items-center justify-center gap-1.5"
          >
            <Eye className="w-3.5 h-3.5" />
            Ver detalle
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDownload?.()
            }}
            className="py-2 px-3 rounded-xl text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Hover indicator */}
      <div className="absolute bottom-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-5 h-5 text-emerald-500" />
      </div>
    </div>
  )
}

// Stats Summary Component
interface NominaStatsProps {
  documents: SplitDocument[]
}

export function NominaStats({ documents }: NominaStatsProps) {
  const processedDocs = documents.filter(d => d.claudeProcessed && d.nominaData)
  
  const stats = React.useMemo(() => {
    if (processedDocs.length === 0) return null
    
    const totalGross = processedDocs.reduce((sum, d) => sum + (d.nominaData?.gross_salary || 0), 0)
    const totalNet = processedDocs.reduce((sum, d) => sum + (d.nominaData?.net_pay || 0), 0)
    const totalCost = processedDocs.reduce((sum, d) => sum + (d.nominaData?.cost_empresa || 0), 0)
    const avgGross = totalGross / processedDocs.length
    const avgNet = totalNet / processedDocs.length
    
    return {
      totalGross,
      totalNet,
      totalCost,
      avgGross,
      avgNet,
      count: processedDocs.length,
      pending: documents.length - processedDocs.length
    }
  }, [documents, processedDocs])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (!stats) return null

  return (
    <div className="bg-white rounded-2xl p-6 mb-6 shadow-2xl border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-[#1B2A41] flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          Resumen de Nóminas
        </h3>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/20 text-emerald-600 border border-emerald-500/30">
            {stats.count} procesadas
          </span>
          {stats.pending > 0 && (
            <span className="px-3 py-1 text-xs font-semibold rounded-full bg-[#C6A664]/20 text-[#C6A664] border border-[#C6A664]/30">
              {stats.pending} pendientes
            </span>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-600 uppercase tracking-wide mb-1">Total Bruto</p>
          <p className="text-2xl font-bold text-[#C6A664] tabular-nums">{formatCurrency(stats.totalGross)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-600 uppercase tracking-wide mb-1">Total Neto</p>
          <p className="text-2xl font-bold text-emerald-600 tabular-nums">{formatCurrency(stats.totalNet)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-600 uppercase tracking-wide mb-1">Coste Empresa</p>
          <p className="text-2xl font-bold text-[#C6A664] tabular-nums">{formatCurrency(stats.totalCost)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-600 uppercase tracking-wide mb-1">Media/Empleado</p>
          <p className="text-2xl font-bold text-[hsl(203,73%,56%)] tabular-nums">{formatCurrency(stats.avgNet)}</p>
        </div>
      </div>
    </div>
  )
}


'use client'

import { 
  Receipt, Calendar, Building2, CreditCard, Sparkles, 
  Eye, Download, Trash2, User, CheckCircle, Tag
} from 'lucide-react'
import { cn } from "@/lib/utils"
import type { Expense, ReceiptAnalysis } from '@/types/expenses'

interface ExpenseCardProps {
  expense: Expense
  isSelected?: boolean
  onSelect?: () => void
  onView?: () => void
  onDelete?: () => void
  onViewImage?: () => void
  compact?: boolean
  employeeAvatar?: string | null
}

export function ExpenseCard({
  expense,
  isSelected = false,
  onSelect,
  onView,
  onDelete,
  onViewImage,
  compact = false,
  employeeAvatar
}: ExpenseCardProps) {
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

  // Parsear notas para obtener merchant si existe
  const parseNotes = () => {
    if (!expense.notes) return null
    try {
      const parsed = JSON.parse(expense.notes)
      return parsed
    } catch {
      return { text: expense.notes }
    }
  }

  // Obtener información de IVA desde conceptos
  const getTaxInfo = () => {
    if (!expense.conceptos || typeof expense.conceptos !== 'object') return null
    if (Array.isArray(expense.conceptos)) {
      // Formato antiguo (solo items)
      return null
    }
    return expense.conceptos.taxes || null
  }

  const notesData = parseNotes()
  const taxInfo = getTaxInfo()
  const hasAI = !!expense.image
  
  // Calcular importe sin IVA si hay información de impuestos
  const baseAmount = taxInfo && taxInfo.subtotal ? taxInfo.subtotal : expense.amount
  const ivaAmount = taxInfo && taxInfo.iva ? taxInfo.iva : null
  const ivaPercentage = taxInfo && taxInfo.ivaPercentage ? taxInfo.ivaPercentage : null

  // Versión compacta (lista)
  if (compact) {
    return (
      <div
        onClick={onSelect}
        className={cn(
          "flex items-center gap-4 p-3 rounded-xl border cursor-pointer transition-all duration-200",
          "hover:shadow-md hover:border-[#C6A664]/50",
          isSelected 
            ? "border-[#C6A664] bg-[#C6A664]/5 shadow-sm" 
            : "border-slate-200 bg-white"
        )}
      >
        {/* Avatar del empleado o Icono/Badge IA */}
        {employeeAvatar ? (
          <img
            src={employeeAvatar}
            alt="Avatar empleado"
            className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-slate-200"
            onClick={(e) => {
              e.stopPropagation()
              onViewImage?.()
            }}
          />
        ) : (
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
            hasAI 
              ? "bg-gradient-to-br from-emerald-500 to-teal-600" 
              : "bg-gradient-to-br from-[#1B2A41] to-slate-700"
          )}>
            {hasAI ? (
              <Sparkles className="w-5 h-5 text-white" />
            ) : (
              <Receipt className="w-5 h-5 text-white" />
            )}
          </div>
        )}

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-slate-800 truncate text-sm">
              {expense.concept}
            </p>
            {hasAI && (
              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-emerald-100 text-emerald-700 flex-shrink-0">
                IA
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-slate-500 truncate">
              {notesData?.merchant || expense.subcategory}
            </span>
            <span className="text-slate-300">•</span>
            <span className="text-xs text-slate-500">
              {formatDate(expense.date || expense.expense_date || '')}
            </span>
          </div>
        </div>

        {/* Importe */}
        <div className="text-right flex-shrink-0">
          <div className="flex flex-col items-end gap-0.5">
            <p className="text-sm font-bold text-red-600 tabular-nums">
              -{formatCurrency(expense.amount)}
            </p>
            {ivaAmount && (
              <p className="text-[10px] text-slate-500 tabular-nums">
                IVA {ivaPercentage ? `(${ivaPercentage}%)` : ''}: {formatCurrency(ivaAmount)}
              </p>
            )}
            <p className="text-xs text-slate-500">{expense.method}</p>
          </div>
        </div>

        {/* Acciones */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {expense.image && onViewImage && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewImage()
              }}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              title="Ver imagen"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {onView && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onView()
              }}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-slate-100 transition-colors"
              title="Ver detalles"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="p-1.5 rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Eliminar"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    )
  }

  // Card completa (grid)
  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-300",
        "bg-white border-2",
        "hover:shadow-2xl hover:scale-[1.02]",
        isSelected 
          ? "border-[#C6A664] shadow-xl ring-2 ring-[#C6A664]/20" 
          : "border-slate-200 hover:border-[#C6A664]/50"
      )}
    >
      {/* Gradient accent top */}
      <div className={cn(
        "absolute top-0 left-0 right-0 h-1",
        hasAI 
          ? "bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500"
          : "bg-gradient-to-r from-[#1B2A41] via-slate-600 to-[#C6A664]"
      )} />
      
      {/* Header */}
      <div className="p-4 pb-2">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            {employeeAvatar ? (
              <img
                src={employeeAvatar}
                alt="Avatar empleado"
                className="w-12 h-12 rounded-full object-cover flex-shrink-0 shadow-lg border-2 border-slate-200"
                onClick={(e) => {
                  e.stopPropagation()
                  onViewImage?.()
                }}
              />
            ) : (
              <div className={cn(
                "w-12 h-12 rounded-full flex items-center justify-center shadow-lg",
                hasAI 
                  ? "bg-gradient-to-br from-emerald-500 to-teal-600"
                  : "bg-gradient-to-br from-[#1B2A41] to-slate-700"
              )}>
                {hasAI ? (
                  <Sparkles className="w-6 h-6 text-white" />
                ) : (
                  <Receipt className="w-6 h-6 text-white" />
                )}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-slate-800 truncate leading-tight">
                {expense.concept}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-500 truncate">
                  {notesData?.merchant || '—'}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {hasAI && (
              <span className="px-2 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-700 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                IA
              </span>
            )}
          </div>
        </div>

        {/* Category & Date */}
        <div className="flex items-center gap-3 mb-3 text-xs">
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
            <Tag className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate max-w-[100px]">{expense.subcategory}</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-600 bg-slate-100 px-2 py-1 rounded-lg">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span>{formatDate(expense.date || expense.expense_date || '')}</span>
          </div>
        </div>
      </div>

      {/* Importe */}
      <div className="px-4 pb-3">
        <div className="bg-gradient-to-br from-red-50 to-rose-50 rounded-xl p-4 border border-red-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <p className="text-xs font-medium text-red-700 uppercase tracking-wide">Importe</p>
                <p className="text-xs text-slate-500">{expense.method}</p>
              </div>
            </div>
            <p className="text-2xl font-bold text-red-600 tabular-nums">
              -{formatCurrency(expense.amount)}
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-4 pb-4">
        <div className="flex items-center gap-2">
          {expense.image && onViewImage && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewImage()
              }}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors text-sm font-medium"
              title="Ver imagen"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {onView && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onView()
              }}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors text-sm font-medium"
            >
              <Eye className="w-4 h-4" />
              Ver
            </button>
          )}
          {onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}


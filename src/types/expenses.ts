/**
 * Tipos para el módulo de Gastos
 */

export interface ReceiptAnalysis {
  amount: number
  category: string
  subcategory: string
  concept: string
  merchant?: string
  date?: string
  notes: string
  confidence: 'high' | 'medium' | 'low'
  rawAnalysis?: string
  time?: string
  items?: ReceiptItem[]
  taxes?: ReceiptTaxes
  paymentMethod?: string
  ticketNumber?: string
}

export interface ReceiptItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

export interface ReceiptTaxes {
  iva?: number
  ivaPercentage?: number
  subtotal?: number
}

export interface VCRError {
  code: 'VISION_API_ERROR' | 'INVALID_IMAGE' | 'PARSING_ERROR' | 'NO_RECEIPT_FOUND'
  message: string
  details?: any
}

export type VCRResult = 
  | { success: true; data: ReceiptAnalysis }
  | { success: false; error: VCRError }

export interface Expense {
  id: string
  company_id: string | null
  employee_id?: string | null
  category_id?: string | null
  expense_date: string  // Campo real en BD
  description: string   // Campo real en BD
  amount: number
  receipt_url?: string | null  // Campo real en BD
  status?: string
  approved_by?: string | null
  approved_at?: string | null
  quantity?: number | null
  unit_price?: number | null
  created_at?: string
  updated_at?: string
  // Campos adicionales parseados desde description (si es JSON)
  concept?: string
  category?: string
  subcategory?: string
  method?: string
  notes?: string | null
  image?: string | null
  date?: string  // Alias para expense_date (siempre presente después de transformación)
  conceptos?: {
    items?: ReceiptItem[]
    taxes?: ReceiptTaxes | null
  } | null  // Conceptos desde BD (JSONB) - incluye items y taxes
  employee_avatar?: string | null  // Avatar del empleado desde employees.image_url
}

export interface ExpenseStats {
  totalGastos: number
  gastosEsteMes: number
  cantidadTotal: number
  cantidadEsteMes: number
}

// Categorías de gastos
export const EXPENSE_CATEGORIES = [
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
] as const

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[number]

// Métodos de pago
export const PAYMENT_METHODS = [
  'Efectivo',
  'Tarjeta',
  'Transferencia',
  'Bizum'
] as const

export type PaymentMethod = typeof PAYMENT_METHODS[number]


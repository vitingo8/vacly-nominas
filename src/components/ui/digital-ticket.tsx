'use client'

/**
 * Digital Ticket Component
 * Genera un ticket digital a partir del análisis de Vision
 */

import { Building2, Calendar, DollarSign, Tag, Receipt, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"

interface TicketItem {
  name: string
  quantity: number
  unitPrice: number
  total: number
}

interface TicketTaxes {
  iva?: number
  ivaPercentage?: number
  subtotal?: number
}

interface DigitalTicketProps {
  amount: number
  concept: string
  subcategory?: string
  merchant?: string
  date?: string
  confidence?: 'high' | 'medium' | 'low'
  visionAnalysis?: string
  time?: string
  items?: TicketItem[]
  conceptos?: {
    items?: TicketItem[]
    taxes?: TicketTaxes | null
  } | TicketItem[]  // Conceptos desde BD (puede ser objeto con items y taxes, o array de items)
  taxes?: TicketTaxes
  paymentMethod?: string
  ticketNumber?: string
}

export function DigitalTicket({
  amount,
  concept,
  subcategory,
  merchant,
  date,
  confidence,
  visionAnalysis,
  time,
  items,
  conceptos,
  taxes,
  paymentMethod,
  ticketNumber,
}: DigitalTicketProps) {
  // Usar conceptos de BD si están disponibles, sino items del análisis
  const displayItems = conceptos && typeof conceptos === 'object' && !Array.isArray(conceptos) && conceptos.items
    ? conceptos.items
    : Array.isArray(conceptos) 
      ? conceptos 
      : items
  
  // Usar taxes de conceptos si están disponibles, sino taxes del análisis
  const displayTaxes = conceptos && typeof conceptos === 'object' && !Array.isArray(conceptos) && conceptos.taxes
    ? conceptos.taxes
    : taxes
  const confidenceColors = {
    high: 'bg-green-100 text-green-700 border-green-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low: 'bg-red-100 text-red-700 border-red-200',
  }

  const confidenceLabels = {
    high: 'Alta precisión',
    medium: 'Precisión media',
    low: 'Precisión baja',
  }

  return (
    <div className="w-full max-w-3xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1B2A41] to-[#C6A664] p-2 md:p-3 text-white flex-shrink-0 z-10">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 md:h-5 md:w-5 flex-shrink-0" />
            <h2 className="text-base md:text-lg font-bold">Ticket Digital</h2>
          </div>
          {confidence && (
            <Badge className={`${confidenceColors[confidence]} text-[10px] px-1.5 py-0 flex-shrink-0`}>
              <Sparkles className="h-2.5 w-2.5 mr-1" />
              {confidenceLabels[confidence]}
            </Badge>
          )}
        </div>
        <p className="text-[10px] md:text-xs text-white/80">Generado por Claude Vision</p>
      </div>

      {/* Content - Scrollable */}
      <div className="p-2 md:p-3 space-y-1.5 md:space-y-2">
        {/* Merchant */}
        {merchant && (
          <div className="flex items-start gap-2 p-2 md:p-3 bg-gray-50 rounded-lg">
            <Building2 className="h-4 w-4 md:h-5 md:w-5 text-[#C6A664] mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase">Establecimiento</p>
              <p className="text-sm md:text-base font-semibold text-gray-900 truncate">{merchant}</p>
            </div>
          </div>
        )}

        {/* Date/Time, Ticket Number, Category, Payment Method */}
        {(date || ticketNumber || subcategory || paymentMethod) && (
          <div className="flex items-center gap-3 md:gap-4 p-2 md:p-3 bg-gray-50 rounded-lg flex-wrap">
            {/* Date and Time */}
            {date && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Calendar className="h-4 w-4 md:h-5 md:w-5 text-[#C6A664] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase">Fecha/Hora</p>
                  <p className="text-xs md:text-sm font-semibold text-gray-900 whitespace-nowrap">
                    {(() => {
                      const dateObj = new Date(date)
                      const day = String(dateObj.getDate()).padStart(2, '0')
                      const month = String(dateObj.getMonth() + 1).padStart(2, '0')
                      const year = dateObj.getFullYear()
                      const dateStr = `${day}/${month}/${year}`
                      if (time) {
                        return `${dateStr} ${time}`
                      }
                      return dateStr
                    })()}
                  </p>
                </div>
              </div>
            )}

            {/* Divider */}
            {date && (ticketNumber || subcategory || paymentMethod) && (
              <div className="h-8 w-px bg-gray-300 flex-shrink-0" />
            )}

            {/* Ticket Number */}
            {ticketNumber && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Receipt className="h-4 w-4 md:h-5 md:w-5 text-[#C6A664] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase">Nº Ticket</p>
                  <p className="text-xs md:text-sm font-semibold text-gray-900 font-mono whitespace-nowrap">{ticketNumber}</p>
                </div>
              </div>
            )}

            {/* Divider */}
            {ticketNumber && (subcategory || paymentMethod) && (
              <div className="h-8 w-px bg-gray-300 flex-shrink-0" />
            )}

            {/* Category */}
            {subcategory && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <Tag className="h-4 w-4 md:h-5 md:w-5 text-[#C6A664] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase">Categoría</p>
                  <Badge className="mt-0.5 bg-[#C6A664]/10 text-[#1B2A41] border-[#C6A664]/20 text-[10px] px-1.5 py-0.5">
                    {subcategory}
                  </Badge>
                </div>
              </div>
            )}

            {/* Divider */}
            {subcategory && paymentMethod && (
              <div className="h-8 w-px bg-gray-300 flex-shrink-0" />
            )}

            {/* Payment Method */}
            {paymentMethod && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-[#C6A664] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase">Método de Pago</p>
                  <p className="text-xs md:text-sm font-semibold text-gray-900 capitalize whitespace-nowrap">{paymentMethod}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Concept */}
        <div className="flex items-start gap-2 p-2 md:p-3 bg-gray-50 rounded-lg">
          <Receipt className="h-4 w-4 md:h-5 md:w-5 text-[#C6A664] mt-0.5 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase">Concepto</p>
            <p className="text-sm md:text-base font-medium text-gray-900 break-words">{concept}</p>
          </div>
        </div>

        {/* Items List */}
        {displayItems && displayItems.length > 0 && (
          <div className="flex flex-col gap-1.5 p-2 md:p-3 bg-gray-50 rounded-lg">
            <p className="text-[10px] md:text-xs text-gray-500 font-medium uppercase mb-1">Productos</p>
            {displayItems.map((item, index) => (
              <div key={index} className="flex justify-between items-start text-xs md:text-sm">
                <div className="flex-1 min-w-0">
                  <span className="text-gray-900 font-medium">
                    {item.quantity}x {item.name}
                  </span>
                  {item.unitPrice != null && (
                    <span className="text-gray-500 text-[10px] md:text-xs ml-1">
                      (@€{(item.unitPrice || 0).toFixed(2)})
                    </span>
                  )}
                </div>
                <span className="text-gray-900 font-semibold ml-2 whitespace-nowrap">
                  €{(item.total || 0).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Vision Analysis Notes */}
        {visionAnalysis && (
          <div className="flex items-start gap-2 p-2 md:p-3 bg-primary/10 rounded-lg border border-primary/20">
            <Sparkles className="h-4 w-4 md:h-5 md:w-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] md:text-xs text-primary font-medium uppercase">Detalles del Análisis</p>
              <p className="text-xs md:text-sm text-primary/90 mt-1 break-words line-clamp-2">{visionAnalysis}</p>
            </div>
          </div>
        )}

        {/* Total Section */}
        <div className="mt-2 md:mt-3 pt-2 md:pt-3 border-t-2 border-dashed border-gray-300">
          {/* Taxes */}
          {displayTaxes && (displayTaxes.subtotal != null || displayTaxes.iva != null) && (
            <div className="flex flex-col gap-1.5 mb-3">
              {displayTaxes.subtotal != null && (
                <div className="flex justify-between text-xs md:text-sm px-2">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900 font-semibold">€{(displayTaxes.subtotal || 0).toFixed(2)}</span>
                </div>
              )}
              {displayTaxes.iva != null && (
                <div className="flex justify-between text-xs md:text-sm px-2">
                  <span className="text-gray-600">
                    IVA {displayTaxes.ivaPercentage != null ? `(${displayTaxes.ivaPercentage}%)` : ''}
                  </span>
                  <span className="text-gray-900 font-semibold">€{(displayTaxes.iva || 0).toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          {/* Total */}
          <div className="flex items-center justify-between p-2 md:p-3 bg-gradient-to-r from-red-50 to-rose-50 rounded-lg border border-red-100">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 md:h-5 md:w-5 text-red-600" />
              <span className="text-sm md:text-base font-semibold text-gray-700">Total</span>
            </div>
            <span className="text-2xl md:text-3xl font-bold text-red-600">
              €{(amount || 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-3 md:px-4 py-1.5 md:py-2 border-t border-gray-200 flex-shrink-0">
        <div className="flex items-center justify-center gap-1.5 text-[10px] md:text-xs text-gray-500">
          <Sparkles className="h-2.5 w-2.5 md:h-3 md:w-3" />
          <span>Analizado automáticamente con IA</span>
        </div>
      </div>
    </div>
  )
}


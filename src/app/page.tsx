'use client'

import { useState, useMemo, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NominaCard, NominaStats } from '@/components/ui/nomina-card'
import { 
  Upload, 
  FileText, 
  Download, 
  Eye, 
  Brain, 
  FileSpreadsheet, 
  Loader2, 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  Building2,
  LayoutGrid,
  List,
  Search,
  Clock,
  ChevronRight,
  Zap,
  History,
  User,
  Calendar,
  RefreshCw,
  Trash2
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
  employee_avatar?: string
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

export default function VaclyNominas() {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [progressMessage, setProgressMessage] = useState('')
  const [currentPage, setCurrentPage] = useState<number | null>(null)
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [splitDocuments, setSplitDocuments] = useState<SplitDocument[]>([])
  const [selectedDocument, setSelectedDocument] = useState<SplitDocument | null>(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [viewerDocument, setViewerDocument] = useState<SplitDocument | null>(null)
  const [isProcessingClaude, setIsProcessingClaude] = useState<string | null>(null)
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'processed' | 'pending'>('all')
  
  // Historial de nóminas procesadas
  const [historialNominas, setHistorialNominas] = useState<any[]>([])
  const [isLoadingHistorial, setIsLoadingHistorial] = useState(false)
  const [historialPage, setHistorialPage] = useState(0)
  const [historialTotal, setHistorialTotal] = useState(0)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const HISTORIAL_LIMIT = 10

  // Leer company_id desde parámetros de URL al montar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paramCompanyId = params.get('company_id')
    if (paramCompanyId) {
      setCompanyId(paramCompanyId)
      console.log(`[FRONTEND NÓMINAS] 🔍 Company ID detectado: ${paramCompanyId}`)
    }
  }, [])

  // Cargar historial de nóminas
  const loadHistorial = async (page = 0) => {
    setIsLoadingHistorial(true)
    try {
      if (!companyId) {
        console.warn('[FRONTEND NÓMINAS] ⚠️ No company_id disponible')
        return
      }
      
      console.log(`[FRONTEND] 🔄 Cargando historial página ${page} para company_id: ${companyId}`)
      const response = await fetch(`/api/nominas?limit=${HISTORIAL_LIMIT}&offset=${page * HISTORIAL_LIMIT}&company_id=${companyId}`)
      const data = await response.json()
      console.log(`[FRONTEND] Historial recibido:`, {
        success: data.success,
        total: data.total,
        count: data.data?.length,
        nominas: data.data?.map((n: any) => ({
          id: n.id,
          dni: n.dni || n.employee?.dni,
          employee_avatar: n.employee_avatar,
          tieneAvatar: !!n.employee_avatar
        }))
      })
      if (data.success) {
        setHistorialNominas(data.data || [])
        setHistorialTotal(data.total || 0)
        setHistorialPage(page)
      }
    } catch (error) {
      console.error('[FRONTEND] ❌ Error cargando historial:', error)
    } finally {
      setIsLoadingHistorial(false)
    }
  }

  // Eliminar nómina del historial
  const deleteNomina = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta nómina del historial?')) return
    try {
      const response = await fetch(`/api/nominas?id=${id}`, { method: 'DELETE' })
      const data = await response.json()
      if (data.success) {
        loadHistorial(historialPage)
      }
    } catch (error) {
      console.error('Error eliminando nómina:', error)
    }
  }

  // Cargar historial al montar y cuando cambia companyId
  useEffect(() => {
    if (companyId) {
      loadHistorial()
    }
  }, [companyId])

  // Filtered documents
  const filteredDocuments = useMemo(() => {
    return splitDocuments.filter(doc => {
      // Filter by status
      if (filterStatus === 'processed' && !doc.claudeProcessed) return false
      if (filterStatus === 'pending' && doc.claudeProcessed) return false
      
      // Filter by search
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const employeeName = doc.nominaData?.employee?.name?.toLowerCase() || ''
        const companyName = doc.nominaData?.company?.name?.toLowerCase() || ''
        const filename = doc.filename.toLowerCase()
        return employeeName.includes(query) || companyName.includes(query) || filename.includes(query)
      }
      
      return true
    })
  }, [splitDocuments, filterStatus, searchQuery])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const uploadStartTime = performance.now()
    console.log(`[FRONTEND] 🚀 INICIO upload y procesamiento: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`)

    setSplitDocuments([])
    setSelectedDocument(null)
    setUploadProgress(0)
    setProgressMessage('')
    setCurrentPage(null)
    setTotalPages(null)
    setIsUploading(true)

    try {
      const formData = new FormData()
      formData.append('pdf', file)

      const uploadStart = performance.now()
      console.log(`[FRONTEND] ⏱️ Subiendo archivo a Supabase Storage...`)
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const uploadDuration = performance.now() - uploadStart
      console.log(`[FRONTEND] ✅ Archivo subido en ${uploadDuration.toFixed(0)}ms`)

      const uploadResult = await uploadResponse.json()

      if (!uploadResponse.ok) {
        throw new Error(uploadResult.error || 'Failed to upload file')
      }

      const processStart = performance.now()
      console.log(`[FRONTEND] ⏱️ Iniciando procesamiento con Claude...`)
      const processResponse = await fetch('/api/process-lux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: uploadResult.filename,
          url: uploadResult.url,
        }),
      })

      if (!processResponse.ok) {
        let errorMessage = `Failed to process PDF (${processResponse.status})`
        try {
          const errorText = await processResponse.text()
          if (errorText) {
            try {
              const errorData = JSON.parse(errorText)
              errorMessage = errorData.error || errorData.details || errorMessage
            } catch {
              if (errorText.length < 200) errorMessage = errorText
            }
          }
        } catch (e) {
          console.error('Error reading error response:', e)
        }
        throw new Error(errorMessage)
      }

      const reader = processResponse.body?.getReader()
      const decoder = new TextDecoder()

      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          const lines = chunk.split('\n')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6))

                if (data.type === 'progress') {
                  setUploadProgress(data.progress)
                  setProgressMessage(data.message)
                  if (data.currentPage) setCurrentPage(data.currentPage)
                  if (data.totalPages) setTotalPages(data.totalPages)
                  
                  // Log progreso cada 10%
                  if (data.progress % 10 === 0) {
                    const elapsed = performance.now() - processStart
                    console.log(`[FRONTEND] 📊 Progreso: ${data.progress}% - ${data.message} (${elapsed.toFixed(0)}ms transcurridos)`)
                  }
                } else if (data.type === 'complete') {
                  const processDuration = performance.now() - processStart
                  const totalDuration = performance.now() - uploadStartTime
                  console.log(`[FRONTEND] ✅ Procesamiento completado:`)
                  console.log(`   - Tiempo procesamiento: ${(processDuration / 1000).toFixed(2)}s`)
                  console.log(`   - Tiempo total (upload + proceso): ${(totalDuration / 1000).toFixed(2)}s`)
                  console.log(`   - Documentos creados: ${data.documents.length}`)
                  console.log(`   - Tiempo promedio por documento: ${(processDuration / data.documents.length).toFixed(0)}ms`)
                  
                  setSplitDocuments(data.documents)
                  setUploadProgress(100)
                  setProgressMessage(`¡Procesamiento completado! ${data.documents.length} documentos creados`)
                  // Actualizar historial después de procesar
                  loadHistorial(0)
                } else if (data.type === 'error') {
                  const errorDuration = performance.now() - processStart
                  console.error(`[FRONTEND] ❌ ERROR después de ${(errorDuration / 1000).toFixed(2)}s:`, data.error)
                  throw new Error(data.error)
                }
              } catch (parseError) {
                console.error('Error parsing SSE data:', parseError)
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Upload/processing error:', error)
      setProgressMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsUploading(false)
    }
  }

  const handleProcessWithClaude = async (document: SplitDocument) => {
    if (document.claudeProcessed && document.nominaData) return

    const processStart = performance.now()
    console.log(`[FRONTEND] 🧠 Procesando documento individual: ${document.id} (página ${document.pageNumber})`)
    console.log(`[FRONTEND] 📝 Longitud texto: ${document.textContent?.length || 0} caracteres`)

    setIsProcessingClaude(document.id)

    try {
      if (!document.id) throw new Error('Documento sin ID válido')

      let textContent = document.textContent
      if (!textContent) {
        throw new Error('No hay contenido de texto disponible. Por favor, vuelve a subir el PDF completo.')
      }

      const response = await fetch('/api/process-lux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: document.id, textContent }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || errorData.details || `HTTP ${response.status}`)
      }

      const result = await response.json()
      const processDuration = performance.now() - processStart

      if (result.success && result.data?.processedData) {
        console.log(`[FRONTEND] ✅ Documento procesado en ${processDuration.toFixed(0)}ms`)
        console.log(`[FRONTEND] processedData recibido:`, {
          employee: result.data.processedData.employee,
          employee_avatar: result.data.processedData.employee_avatar,
          dni: result.data.processedData.employee?.dni
        })
        setSplitDocuments(prev =>
          prev.map(doc =>
            doc.id === document.id
              ? { 
                  ...doc, 
                  claudeProcessed: true, 
                  nominaData: {
                    ...result.data.processedData,
                    employee_avatar: result.data.processedData.employee_avatar
                  }
                }
              : doc
          )
        )
      } else {
        throw new Error(result.error || 'Sin datos en la respuesta de Claude')
      }
    } catch (error) {
      const errorDuration = performance.now() - processStart
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
      console.error(`[FRONTEND] ❌ ERROR procesando documento después de ${errorDuration.toFixed(0)}ms:`, errorMsg)
      alert(`Error procesando documento:\n\n${errorMsg}`)
    } finally {
      setIsProcessingClaude(null)
    }
  }

  const handleBatchProcess = async () => {
    if (splitDocuments.length === 0) return

    setIsBatchProcessing(true)
    setBatchProgress(0)

    const unprocessedDocs = splitDocuments.filter(doc => !doc.claudeProcessed)
    const BATCH_SIZE = 4 // Procesar en lotes paralelos

    for (let i = 0; i < unprocessedDocs.length; i += BATCH_SIZE) {
      const batch = unprocessedDocs.slice(i, Math.min(i + BATCH_SIZE, unprocessedDocs.length))
      
      // Procesar batch en paralelo
      await Promise.allSettled(batch.map(doc => handleProcessWithClaude(doc)))
      
      setBatchProgress(((i + batch.length) / unprocessedDocs.length) * 100)
    }

    setIsBatchProcessing(false)
    setBatchProgress(100)
  }

  const handleExportExcel = async () => {
    setIsExportingExcel(true)

    try {
      const processedDocs = splitDocuments.filter(doc => doc.claudeProcessed && doc.nominaData)

      if (processedDocs.length === 0) {
        alert('No hay documentos procesados para exportar')
        return
      }

      const response = await fetch('/api/export-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents: processedDocs.map(doc => ({
            id: doc.id,
            filename: doc.filename,
            ...doc.nominaData
          }))
        }),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = `nominas-export-${new Date().toISOString().split('T')[0]}.xlsx`
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
      } else {
        const error = await response.json()
        alert(`Error exportando Excel: ${error.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExportingExcel(false)
    }
  }

  const openViewer = (document: SplitDocument) => {
    setViewerDocument(document)
    setIsViewerOpen(true)
  }

  // Función para abrir visor desde historial de nóminas
  const openViewerFromHistorial = async (nomina: any) => {
    try {
      // Buscar el documento procesado relacionado con esta nómina
      const { getSupabaseClient } = await import('@/lib/supabase')
      const supabase = getSupabaseClient()
      
      // Buscar en processed_documents usando el document_name de la nómina
      let pdfUrl = ''
      let textUrl = ''
      
      if (nomina.document_name) {
        try {
          // Intentar obtener signed URL para producción
          const { data: signedPdfData } = await supabase
            .storage
            .from('Nominas')
            .createSignedUrl(nomina.document_name, 3600)
          
          if (signedPdfData) {
            pdfUrl = signedPdfData.signedUrl
          } else {
            // Fallback a public URL
            const { data: publicPdfData } = supabase
              .storage
              .from('Nominas')
              .getPublicUrl(nomina.document_name)
            pdfUrl = publicPdfData.publicUrl
          }
        } catch (urlError) {
          console.error('[FRONTEND] Error obteniendo URL del PDF:', urlError)
          const { data: publicPdfData } = supabase
            .storage
            .from('Nominas')
            .getPublicUrl(nomina.document_name)
          pdfUrl = publicPdfData.publicUrl
        }
      }

      // Crear un SplitDocument desde la nómina del historial
      const document: SplitDocument = {
        id: nomina.id,
        filename: nomina.document_name || `nomina_${nomina.id}.pdf`,
        pageNumber: 1,
        textContent: '',
        pdfUrl: pdfUrl,
        textUrl: textUrl,
        claudeProcessed: true,
        nominaData: {
          id: nomina.id,
          nominaId: nomina.id,
          period_start: nomina.period_start,
          period_end: nomina.period_end,
          employee: nomina.employee,
          company: nomina.company,
          perceptions: nomina.perceptions,
          deductions: nomina.deductions,
          contributions: nomina.contributions,
          base_ss: nomina.base_ss,
          net_pay: nomina.net_pay,
          gross_salary: nomina.gross_salary,
          iban: nomina.iban,
          swift_bic: nomina.swift_bic,
          cost_empresa: nomina.cost_empresa,
          signed: nomina.signed,
          employee_avatar: nomina.employee_avatar
        }
      }
      openViewer(document)
    } catch (error) {
      console.error('[FRONTEND] Error abriendo visor desde historial:', error)
      alert('Error al abrir el documento. Por favor, intenta de nuevo.')
    }
  }

  const processedCount = splitDocuments.filter(doc => doc.claudeProcessed).length
  const pendingCount = splitDocuments.length - processedCount

  const formatCurrency = (amount: number | undefined) => {
    if (!amount) return '€0.00'
    return new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">
        {/* Upload Section */}
        <Card className="mb-8 border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1B2A41]/5 via-transparent to-[#C6A664]/5 pointer-events-none" />
          <CardContent className="p-8 relative">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <Upload className="w-5 h-5 text-[#C6A664]" />
                  Subir PDF de Nóminas
                </h2>
                <p className="text-slate-600 text-sm">
                  Arrastra un archivo PDF o haz clic para seleccionar. Procesamos automáticamente cada página en paralelo.
                </p>
              </div>
              
              <div>
                <Label htmlFor="pdf-upload" className="cursor-pointer">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-[#1B2A41] to-[#2d4057] text-white px-8 py-4 rounded-2xl hover:from-[#152036] hover:to-[#1B2A41] transition-all shadow-lg shadow-[#1B2A41]/25 hover:shadow-xl hover:shadow-[#1B2A41]/30 font-semibold">
                    <Upload className="h-5 w-5" />
                    <span>Seleccionar PDF</span>
                  </div>
                </Label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </div>
            </div>

            {/* Upload Progress */}
            {isUploading && (
              <div className="mt-6 bg-gradient-to-r from-[#C6A664]/10 to-[#B8964A]/10 p-6 rounded-2xl border border-[#C6A664]/20">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#C6A664] flex items-center justify-center animate-pulse">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Procesando documento...</span>
                      <p className="text-sm text-slate-600">{progressMessage}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-[#C6A664]">
                    {currentPage && totalPages ? `${currentPage}/${totalPages}` : `${uploadProgress}%`}
                  </span>
                </div>
                <Progress value={uploadProgress} variant="gold" className="w-full h-3 bg-[#C6A664]/20" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Results Section */}
        {splitDocuments.length > 0 && (
          <>
            {/* Stats Summary */}
            <NominaStats documents={splitDocuments} />

            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="Buscar empleado..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 w-64 bg-white border-slate-200"
                  />
                </div>
                
                {/* Filter */}
                <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setFilterStatus('all')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      filterStatus === 'all' 
                        ? 'bg-slate-900 text-white' 
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Todos
                  </button>
                  <button
                    onClick={() => setFilterStatus('processed')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      filterStatus === 'processed' 
                        ? 'bg-emerald-500 text-white' 
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Procesados
                  </button>
                  <button
                    onClick={() => setFilterStatus('pending')}
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      filterStatus === 'pending' 
                        ? 'bg-[#C6A664] text-white' 
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Pendientes
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                {/* View Toggle */}
                <div className="flex items-center bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setViewMode('grid')}
                    className={`p-2.5 transition-colors ${
                      viewMode === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2.5 transition-colors ${
                      viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>

                {/* Batch Process */}
                {pendingCount > 0 && (
                  <Button
                    onClick={handleBatchProcess}
                    disabled={isBatchProcessing}
                    className="bg-[hsl(203,73%,56%)] hover:bg-[hsl(203,73%,50%)] text-white shadow-lg shadow-[hsl(203,73%,56%)]/25"
                  >
                    {isBatchProcessing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {Math.round(batchProgress)}%
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4 mr-2" />
                        Procesar Todos ({pendingCount})
                      </>
                    )}
                  </Button>
                )}

                {/* Export */}
                <Button
                  onClick={handleExportExcel}
                  disabled={isExportingExcel || processedCount === 0}
                  className="bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg shadow-emerald-500/25"
                >
                  {isExportingExcel ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4 mr-2" />
                      Exportar Excel
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Documents Grid/List */}
            <div className={viewMode === 'grid' 
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-5 gap-4 w-full"
              : "flex flex-col gap-3 w-full"
            }>
              {filteredDocuments.map((doc) => (
                <NominaCard
                  key={doc.id}
                  document={doc}
                  compact={viewMode === 'list'}
                  isSelected={selectedDocument?.id === doc.id}
                  isProcessing={isProcessingClaude === doc.id}
                  onSelect={() => setSelectedDocument(doc)}
                  onProcess={() => handleProcessWithClaude(doc)}
                  onView={() => openViewer(doc)}
                  onDownload={() => window.open(doc.pdfUrl, '_blank')}
                />
              ))}
            </div>

            {filteredDocuments.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                  <Search className="w-8 h-8 text-slate-400" />
                </div>
                <p className="text-slate-600">No se encontraron documentos con los filtros actuales</p>
              </div>
            )}
          </>
        )}

        {/* Empty State */}
        {splitDocuments.length === 0 && !isUploading && (
          <div className="text-center py-20">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center mx-auto mb-6 shadow-lg">
              <FileText className="w-12 h-12 text-[#C6A664]" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Sin documentos</h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Sube un archivo PDF con nóminas para comenzar. Procesaremos cada página automáticamente con IA.
            </p>
          </div>
        )}

        {/* Historial de Nóminas Procesadas */}
        <div className="mt-12 pt-8 border-t border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#1B2A41]/10 to-[#C6A664]/10 flex items-center justify-center shadow-lg">
                <History className="w-8 h-8 text-[#C6A664]" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Historial de Nóminas</h2>
                <p className="text-sm text-slate-500">{historialTotal} nóminas procesadas en total</p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadHistorial(historialPage)}
              disabled={isLoadingHistorial}
              className="border-[#C6A664]/30 text-[#1B2A41] hover:bg-[#C6A664]/10"
            >
              {isLoadingHistorial ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-2">Actualizar</span>
            </Button>
          </div>

          {isLoadingHistorial && historialNominas.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[#C6A664]" />
            </div>
          ) : historialNominas.length === 0 ? (
            <div className="text-center py-16 bg-slate-50 rounded-xl">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5 flex items-center justify-center mx-auto mb-4">
                <History className="w-10 h-10 text-[#C6A664]/50" />
              </div>
              <h3 className="text-lg font-semibold text-slate-600 mb-1">Sin historial</h3>
              <p className="text-slate-500 text-sm">No hay nóminas procesadas todavía</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="font-semibold text-slate-700">Empleado</TableHead>
                      <TableHead className="font-semibold text-slate-700">Empresa</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">Período</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">Bruto</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">Neto</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">Coste Emp.</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center">Fecha</TableHead>
                      <TableHead className="font-semibold text-slate-700 text-center w-20">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historialNominas.map((nomina) => (
                      <TableRow key={nomina.id} className="hover:bg-slate-50/50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {nomina.employee_avatar ? (
                              <img 
                                src={nomina.employee_avatar} 
                                alt={nomina.employee?.name || 'Avatar'}
                                className="w-8 h-8 rounded-full object-cover flex-shrink-0 border border-slate-200"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                                <User className="w-4 h-4 text-white" />
                              </div>
                            )}
                            <div>
                              <p className="font-medium text-slate-800 text-sm">
                                {nomina.employee?.name || 'Sin nombre'}
                              </p>
                              <p className="text-xs text-slate-500">{nomina.dni || nomina.employee?.dni || '—'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className="text-sm text-slate-700">{nomina.company?.name || '—'}</p>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1.5 text-sm text-slate-600">
                            <Calendar className="w-3.5 h-3.5" />
                            {nomina.period_start ? new Date(nomina.period_start).toLocaleDateString('es-ES', { month: 'short', year: 'numeric' }) : '—'}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-sm font-semibold text-[#1B2A41]">
                            {formatCurrency(nomina.gross_salary)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-sm font-semibold text-emerald-600">
                            {formatCurrency(nomina.net_pay)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="font-mono text-sm font-semibold text-[#C6A664]">
                            {formatCurrency(nomina.cost_empresa)}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="text-xs text-slate-500">
                            {nomina.created_at ? new Date(nomina.created_at).toLocaleDateString('es-ES') : '—'}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openViewerFromHistorial(nomina)}
                              className="h-7 w-7 p-0 text-slate-400 hover:text-primary hover:bg-primary/10"
                              title="Ver detalles"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => deleteNomina(nomina.id)}
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
              </div>

              {/* Paginación */}
              {historialTotal > HISTORIAL_LIMIT && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-slate-500">
                    Mostrando {historialPage * HISTORIAL_LIMIT + 1}-{Math.min((historialPage + 1) * HISTORIAL_LIMIT, historialTotal)} de {historialTotal}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadHistorial(historialPage - 1)}
                      disabled={historialPage === 0 || isLoadingHistorial}
                      className="border-slate-200"
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => loadHistorial(historialPage + 1)}
                      disabled={(historialPage + 1) * HISTORIAL_LIMIT >= historialTotal || isLoadingHistorial}
                      className="border-slate-200"
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Detail Viewer Dialog */}
        <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
          <DialogContent className="max-w-6xl h-[90vh] p-0 gap-0 overflow-hidden">
            <DialogHeader className="px-6 py-4 border-b bg-slate-50">
              <DialogTitle className="text-xl font-bold text-slate-800 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                {viewerDocument?.nominaData?.employee?.name || `Página ${viewerDocument?.pageNumber}`}
              </DialogTitle>
              <DialogDescription>
                {viewerDocument?.nominaData?.company?.name} • {viewerDocument?.filename}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-auto p-6">
              {viewerDocument?.claudeProcessed && viewerDocument?.nominaData ? (
                <Tabs defaultValue="resumen" className="w-full">
                  <TabsList className="grid w-full grid-cols-4 mb-6">
                    <TabsTrigger value="resumen">Resumen</TabsTrigger>
                    <TabsTrigger value="percepciones">Percepciones</TabsTrigger>
                    <TabsTrigger value="deducciones">Deducciones</TabsTrigger>
                    <TabsTrigger value="documento">Documento</TabsTrigger>
                  </TabsList>

                  <TabsContent value="resumen" className="space-y-6">
                    {/* KPIs */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="border-0 shadow-lg bg-gradient-to-br from-[#C6A664]/10 to-[#B8964A]/10">
                        <CardContent className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-5 h-5 text-[#C6A664]" />
                            <span className="text-sm font-medium text-[#1B2A41]">Salario Bruto</span>
                          </div>
                          <p className="text-3xl font-bold text-[#1B2A41]">
                            {formatCurrency(viewerDocument.nominaData.gross_salary)}
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-emerald-50 to-green-50">
                        <CardContent className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <CreditCard className="w-5 h-5 text-emerald-600" />
                            <span className="text-sm font-medium text-emerald-700">Salario Neto</span>
                          </div>
                          <p className="text-3xl font-bold text-emerald-900">
                            {formatCurrency(viewerDocument.nominaData.net_pay)}
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-[#1B2A41]/5 to-[#C6A664]/5">
                        <CardContent className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-5 h-5 text-[#C6A664]" />
                            <span className="text-sm font-medium text-[#1B2A41]">Coste Empresa</span>
                          </div>
                          <p className="text-3xl font-bold text-[#1B2A41]">
                            {formatCurrency(viewerDocument.nominaData.cost_empresa)}
                          </p>
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-gray-50">
                        <CardContent className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-5 h-5 text-slate-600" />
                            <span className="text-sm font-medium text-slate-700">Base SS</span>
                          </div>
                          <p className="text-3xl font-bold text-slate-900">
                            {formatCurrency(viewerDocument.nominaData.base_ss)}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Employee & Company Info */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card className="border-0 shadow-lg">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-[#C6A664]/10 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-[#C6A664]" />
                            </div>
                            Datos del Empleado
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {[
                            { label: 'Nombre', value: viewerDocument.nominaData.employee?.name },
                            { label: 'DNI', value: viewerDocument.nominaData.employee?.dni },
                            { label: 'NSS', value: viewerDocument.nominaData.employee?.nss },
                            { label: 'Categoría', value: viewerDocument.nominaData.employee?.category },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                              <span className="text-sm text-slate-600">{label}</span>
                              <span className="text-sm font-medium text-slate-900">{value || '—'}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card className="border-0 shadow-lg">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-emerald-600" />
                            </div>
                            Datos de la Empresa
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {[
                            { label: 'Empresa', value: viewerDocument.nominaData.company?.name },
                            { label: 'CIF', value: viewerDocument.nominaData.company?.cif },
                            { label: 'Período', value: `${viewerDocument.nominaData.period_start} - ${viewerDocument.nominaData.period_end}` },
                            { label: 'IBAN', value: viewerDocument.nominaData.iban },
                          ].map(({ label, value }) => (
                            <div key={label} className="flex justify-between items-center py-2 border-b border-slate-100 last:border-0">
                              <span className="text-sm text-slate-600">{label}</span>
                              <span className="text-sm font-medium text-slate-900 text-right max-w-[200px] truncate">{value || '—'}</span>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  <TabsContent value="percepciones">
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle>Percepciones ({viewerDocument.nominaData.perceptions?.length || 0})</CardTitle>
                        <CardDescription>Detalle de todos los ingresos y complementos</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {viewerDocument.nominaData.perceptions && viewerDocument.nominaData.perceptions.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Concepto</TableHead>
                                <TableHead>Código</TableHead>
                                <TableHead className="text-right">Importe</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {viewerDocument.nominaData.perceptions.map((p, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{p.concept || 'N/A'}</TableCell>
                                  <TableCell>{p.code || '—'}</TableCell>
                                  <TableCell className="text-right font-mono text-emerald-600">
                                    {formatCurrency(p.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-emerald-50">
                                <TableCell colSpan={2} className="font-bold">Total Percepciones</TableCell>
                                <TableCell className="text-right font-bold font-mono text-emerald-700">
                                  {formatCurrency(viewerDocument.nominaData.perceptions.reduce((s, p) => s + (p.amount || 0), 0))}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        ) : (
                          <p className="text-center text-slate-500 py-8">No hay percepciones registradas</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="deducciones">
                    <Card className="border-0 shadow-lg">
                      <CardHeader>
                        <CardTitle>Deducciones ({viewerDocument.nominaData.deductions?.length || 0})</CardTitle>
                        <CardDescription>Retenciones y descuentos aplicados</CardDescription>
                      </CardHeader>
                      <CardContent>
                        {viewerDocument.nominaData.deductions && viewerDocument.nominaData.deductions.length > 0 ? (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Concepto</TableHead>
                                <TableHead>Código</TableHead>
                                <TableHead className="text-right">Importe</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {viewerDocument.nominaData.deductions.map((d, i) => (
                                <TableRow key={i}>
                                  <TableCell className="font-medium">{d.concept || 'N/A'}</TableCell>
                                  <TableCell>{d.code || '—'}</TableCell>
                                  <TableCell className="text-right font-mono text-rose-600">
                                    -{formatCurrency(d.amount)}
                                  </TableCell>
                                </TableRow>
                              ))}
                              <TableRow className="bg-rose-50">
                                <TableCell colSpan={2} className="font-bold">Total Deducciones</TableCell>
                                <TableCell className="text-right font-bold font-mono text-rose-700">
                                  -{formatCurrency(viewerDocument.nominaData.deductions.reduce((s, d) => s + (d.amount || 0), 0))}
                                </TableCell>
                              </TableRow>
                            </TableBody>
                          </Table>
                        ) : (
                          <p className="text-center text-slate-500 py-8">No hay deducciones registradas</p>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="documento">
                    <div className="h-[60vh] flex flex-col">
                      <div className="flex-1 rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50">
                        <iframe
                          src={`${viewerDocument.pdfUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                          className="w-full h-full"
                          title="PDF Viewer"
                          allowFullScreen
                          style={{ border: 'none' }}
                        />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-sm text-slate-600">
                          Si el PDF no se muestra correctamente, puedes abrirlo en una nueva pestaña o descargarlo
                        </p>
                        <div className="flex items-center gap-2">
                          <a
                            href={viewerDocument.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                          >
                            <Eye className="w-4 h-4 inline mr-2" />
                            Abrir en nueva pestaña
                          </a>
                          <a
                            href={viewerDocument.pdfUrl}
                            download
                            className="px-4 py-2 bg-[#1B2A41] text-white rounded-lg hover:bg-[#152036] transition-colors text-sm font-medium"
                          >
                            <Download className="w-4 h-4 inline mr-2" />
                            Descargar PDF
                          </a>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="h-[60vh] flex flex-col">
                  <div className="flex-1 rounded-xl border-2 border-slate-200 overflow-hidden bg-slate-50">
                    <iframe
                      src={`${viewerDocument?.pdfUrl}#toolbar=1&navpanes=1&scrollbar=1`}
                      className="w-full h-full"
                      title="PDF Viewer"
                      allowFullScreen
                      style={{ border: 'none' }}
                    />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <p className="text-sm text-slate-600">
                      Si el PDF no se muestra correctamente, puedes abrirlo en una nueva pestaña o descargarlo
                    </p>
                    <div className="flex items-center gap-2">
                      <a
                        href={viewerDocument?.pdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors text-sm font-medium"
                      >
                        <Eye className="w-4 h-4 inline mr-2" />
                        Abrir en nueva pestaña
                      </a>
                      <a
                        href={viewerDocument?.pdfUrl}
                        download
                        className="px-4 py-2 bg-[#1B2A41] text-white rounded-lg hover:bg-[#152036] transition-colors text-sm font-medium"
                      >
                        <Download className="w-4 h-4 inline mr-2" />
                        Descargar PDF
                      </a>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

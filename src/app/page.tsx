'use client'

import { useState, useMemo, useEffect } from 'react'
import { DASHBOARD_PAGE_BG } from '@/components/dashboard-styles'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NominaCard, NominaStats } from '@/components/ui/nomina-card'
import { NominaViewerDialog } from '@/components/nomina-viewer-dialog'
import type { UploadQuota } from '@/lib/upload-quota'
import {
  ArrowPathIcon,
  ArrowUpTrayIcon,
  BoltIcon,
  CpuChipIcon,
  DocumentTextIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  Squares2X2Icon,
  TableCellsIcon,
} from '@heroicons/react/24/outline'

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
  savedToDb?: boolean
  skipReason?: 'duplicate' | 'wrong_company' | 'employee_not_found'
  skipMessage?: string
  otherCompany?: { company_id: string; name: string; cif: string }
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
  
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [skipCompanyValidation, setSkipCompanyValidation] = useState(false)
  const [uploadQuota, setUploadQuota] = useState<UploadQuota | null>(null)
  const [isLoadingQuota, setIsLoadingQuota] = useState(false)

  // Leer company_id y modo super-admin desde parámetros de URL al montar
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paramCompanyId = params.get('company_id')
    if (paramCompanyId) {
      setCompanyId(paramCompanyId)
      console.log(`[FRONTEND NÓMINAS] 🔍 Company ID detectado: ${paramCompanyId}`)
    }
    const isSuperAdmin =
      params.get('super_admin') === '1' || params.get('super_admin') === 'true'
    setSkipCompanyValidation(isSuperAdmin)
    if (isSuperAdmin) {
      console.log('[FRONTEND NÓMINAS] Super-admin: validación CIF de empresa desactivada')
    }
  }, [])

  const loadUploadQuota = async () => {
    if (!companyId) return
    setIsLoadingQuota(true)
    try {
      const response = await fetch(`/api/upload-quota?company_id=${companyId}`)
      const data = await response.json()
      if (data.success) {
        setUploadQuota(data.quota)
      }
    } catch (error) {
      console.error('[FRONTEND] Error cargando cuota de subida:', error)
    } finally {
      setIsLoadingQuota(false)
    }
  }

  useEffect(() => {
    if (companyId) {
      loadUploadQuota()
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

    if (!companyId) {
      setProgressMessage('Error: abre la app con ?company_id=... en la URL para procesar nóminas de una empresa.')
      return
    }

    try {
      const { PDFDocument } = await import('pdf-lib')
      const pdfDoc = await PDFDocument.load(await file.arrayBuffer())
      const pageCount = pdfDoc.getPageCount()

      if (uploadQuota && pageCount > uploadQuota.remainingPages) {
        setProgressMessage(
          `Límite mensual alcanzado: este PDF tiene ${pageCount} página(s) y solo quedan ${uploadQuota.remainingPages} ` +
          `este mes (de ${uploadQuota.maxPages}: ${uploadQuota.employeeCount} empleados × ${uploadQuota.pagesPerEmployee} páginas). ` +
          `Las páginas cuentan al procesar el PDF, aunque no se guarden nóminas.`,
        )
        return
      }
    } catch (pageCountError) {
      console.warn('[FRONTEND] No se pudo contar páginas del PDF antes de subir:', pageCountError)
    }

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
          companyId,
          employeeId: undefined, // opcional: asociar a empleado concreto
          skipCompanyValidation,
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
                  const docs = data.documents as SplitDocument[]
                  const savedCount = docs.filter((doc) => doc.savedToDb).length
                  const duplicateCount = docs.filter((doc) => doc.skipReason === 'duplicate').length
                  const wrongCompanyCount = docs.filter((doc) => doc.skipReason === 'wrong_company').length
                  const notFoundCount = docs.filter(
                    (doc) => doc.skipReason === 'employee_not_found' || (doc.claudeProcessed && doc.savedToDb === false && !doc.skipReason)
                  ).length
                  const blockedCount = duplicateCount + wrongCompanyCount + notFoundCount
                  console.log(`[FRONTEND] ✅ Procesamiento completado:`)
                  console.log(`   - Tiempo procesamiento: ${(processDuration / 1000).toFixed(2)}s`)
                  console.log(`   - Tiempo total (upload + proceso): ${(totalDuration / 1000).toFixed(2)}s`)
                  console.log(`   - Documentos creados: ${docs.length}`)
                  console.log(`   - Guardados en BD: ${savedCount}`)
                  console.log(`   - Bloqueados: ${blockedCount}`)
                  console.log(`   - Tiempo promedio por documento: ${(processDuration / docs.length).toFixed(0)}ms`)
                  
                  setSplitDocuments(docs)
                  setUploadProgress(100)

                  const parts: string[] = []
                  if (savedCount > 0) parts.push(`${savedCount} guardadas`)
                  if (duplicateCount > 0) parts.push(`${duplicateCount} duplicadas (ya existían)`)
                  if (wrongCompanyCount > 0) parts.push(`${wrongCompanyCount} de otra empresa`)
                  if (notFoundCount > 0) parts.push(`${notFoundCount} sin empleado en la empresa`)

                  setProgressMessage(
                    blockedCount > 0
                      ? `Procesadas ${docs.length} páginas: ${parts.join(', ')}.`
                      : `¡Procesamiento completado! ${docs.length} documentos guardados`
                  )
                  loadUploadQuota()
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
      loadUploadQuota()
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
      if (!document.filename) {
        throw new Error('No se encontró el PDF del documento. Vuelve a subir el PDF completo.')
      }

      // Reprocesamos a partir del PDF almacenado (Claude lee el PDF directamente),
      // ya no se depende del texto extraído.
      const response = await fetch('/api/process-lux', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: document.id,
          filename: document.filename,
          companyId,
          skipCompanyValidation,
        }),
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
    <div className={DASHBOARD_PAGE_BG}>
      <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-16 py-8">
        {/* Upload Section */}
        <Card className="mb-8 border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-[#1B2A41]/5 via-transparent to-[#C6A664]/5 pointer-events-none" />
          <CardContent className="p-8 relative">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <ArrowUpTrayIcon className="h-4.5 w-4.5 shrink-0 text-[#C6A664]" />
                  Subir PDF de Nóminas
                </h2>
                <p className="text-slate-600 text-sm">
                  Arrastra un archivo PDF o haz clic para seleccionar. Procesamos automáticamente cada página en paralelo.
                </p>
                {uploadQuota && (
                  <p className={`text-sm mt-2 ${uploadQuota.remainingPages === 0 ? 'text-rose-600 font-medium' : 'text-slate-500'}`}>
                    Cuota mensual ({uploadQuota.period}): {uploadQuota.usedPages} / {uploadQuota.maxPages} páginas procesadas
                    ({uploadQuota.employeeCount} empleados × {uploadQuota.pagesPerEmployee} páginas).
                    {uploadQuota.remainingPages > 0
                      ? ` Quedan ${uploadQuota.remainingPages} este mes.`
                      : ' Límite mensual alcanzado.'}
                  </p>
                )}
                {isLoadingQuota && (
                  <p className="text-xs text-slate-400 mt-1">Calculando cuota disponible...</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="pdf-upload" className="cursor-pointer">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-[#1B2A41] to-[#2d4057] text-white px-8 py-4 rounded-2xl hover:from-[#152036] hover:to-[#1B2A41] transition-all shadow-lg shadow-[#1B2A41]/25 hover:shadow-xl hover:shadow-[#1B2A41]/30 font-semibold">
                    <ArrowUpTrayIcon className="h-4.5 w-4.5 shrink-0" />
                    <span>Seleccionar PDF</span>
                  </div>
                </Label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading || uploadQuota?.remainingPages === 0}
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
                      <BoltIcon className="h-4.5 w-4.5 shrink-0 text-white" />
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
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 shrink-0 text-slate-400" />
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
                    <Squares2X2Icon className="h-4.5 w-4.5 shrink-0" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={`p-2.5 transition-colors ${
                      viewMode === 'list' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <ListBulletIcon className="h-4.5 w-4.5 shrink-0" />
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
                        <ArrowPathIcon className="h-4.5 w-4.5 shrink-0 mr-2 animate-spin" />
                        {Math.round(batchProgress)}%
                      </>
                    ) : (
                      <>
                        <CpuChipIcon className="h-4.5 w-4.5 shrink-0 mr-2" />
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
                      <ArrowPathIcon className="h-4.5 w-4.5 shrink-0 mr-2 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <TableCellsIcon className="h-4.5 w-4.5 shrink-0 mr-2" />
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
                  <MagnifyingGlassIcon className="w-8 h-8 text-slate-400" />
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
              <DocumentTextIcon className="w-12 h-12 text-[#C6A664]" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Sin documentos</h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Sube un archivo PDF con nóminas para comenzar. Procesaremos cada página automáticamente con IA.
            </p>
          </div>
        )}

        <NominaViewerDialog
          open={isViewerOpen}
          onOpenChange={setIsViewerOpen}
          document={viewerDocument}
        />
      </div>
    </div>
  )
}

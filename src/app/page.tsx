'use client'

import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NominaCard, NominaStats } from '@/components/ui/nomina-card'
import { 
  Upload, 
  FileText, 
  Download, 
  Eye, 
  Brain, 
  CheckCircle, 
  FileSpreadsheet, 
  Loader2, 
  DollarSign, 
  TrendingUp, 
  CreditCard, 
  Building2,
  Sparkles,
  LayoutGrid,
  List,
  Filter,
  Search,
  Clock,
  ChevronRight,
  Zap
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

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      const uploadResult = await uploadResponse.json()

      if (!uploadResponse.ok) {
        throw new Error(uploadResult.error || 'Failed to upload file')
      }

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
                } else if (data.type === 'complete') {
                  setSplitDocuments(data.documents)
                  setUploadProgress(100)
                  setProgressMessage(`¡Procesamiento completado! ${data.documents.length} documentos creados`)
                } else if (data.type === 'error') {
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

      if (result.success && result.data?.processedData) {
        setSplitDocuments(prev =>
          prev.map(doc =>
            doc.id === document.id
              ? { ...doc, claudeProcessed: true, nominaData: result.data.processedData }
              : doc
          )
        )
      } else {
        throw new Error(result.error || 'Sin datos en la respuesta de Claude')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
      console.error('Error procesando con Claude:', errorMsg)
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/25">
                <FileSpreadsheet className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                  Vacly Nóminas
                  <Badge className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white border-0 text-xs px-2">
                    <Sparkles className="w-3 h-3 mr-1" />
                    IA
                  </Badge>
                </h1>
                <p className="text-slate-400 text-sm">Procesamiento inteligente con Claude 4.5 Haiku</p>
              </div>
            </div>
            
            {/* Quick Stats in Header */}
            {splitDocuments.length > 0 && (
              <div className="hidden md:flex items-center gap-6">
                <div className="text-center">
                  <p className="text-2xl font-bold text-white">{splitDocuments.length}</p>
                  <p className="text-xs text-slate-400">Documentos</p>
                </div>
                <div className="w-px h-10 bg-slate-700" />
                <div className="text-center">
                  <p className="text-2xl font-bold text-emerald-400">{processedCount}</p>
                  <p className="text-xs text-slate-400">Procesados</p>
                </div>
                {pendingCount > 0 && (
                  <>
                    <div className="w-px h-10 bg-slate-700" />
                    <div className="text-center">
                      <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
                      <p className="text-xs text-slate-400">Pendientes</p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Upload Section */}
        <Card className="mb-8 border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-emerald-500/5 pointer-events-none" />
          <CardContent className="p-8 relative">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 text-center md:text-left">
                <h2 className="text-xl font-bold text-slate-800 mb-2 flex items-center gap-2 justify-center md:justify-start">
                  <Upload className="w-5 h-5 text-amber-500" />
                  Subir PDF de Nóminas
                </h2>
                <p className="text-slate-600 text-sm">
                  Arrastra un archivo PDF o haz clic para seleccionar. Procesamos automáticamente cada página en paralelo.
                </p>
              </div>
              
              <div>
                <Label htmlFor="pdf-upload" className="cursor-pointer">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-8 py-4 rounded-2xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/30 font-semibold">
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
              <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center animate-pulse">
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <span className="font-semibold text-slate-800">Procesando documento...</span>
                      <p className="text-sm text-slate-600">{progressMessage}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-blue-600">
                    {currentPage && totalPages ? `${currentPage}/${totalPages}` : `${uploadProgress}%`}
                  </span>
                </div>
                <Progress value={uploadProgress} className="w-full h-3 bg-blue-100" />
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
                        ? 'bg-amber-500 text-white' 
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
                    className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white shadow-lg shadow-purple-500/25"
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
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
              : "flex flex-col gap-3"
            }>
              {filteredDocuments.map((doc) => (
                <NominaCard
                  key={doc.id}
                  document={doc}
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
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center mx-auto mb-6 shadow-lg">
              <FileText className="w-12 h-12 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 mb-2">Sin documentos</h3>
            <p className="text-slate-600 max-w-md mx-auto">
              Sube un archivo PDF con nóminas para comenzar. Procesaremos cada página automáticamente con IA.
            </p>
          </div>
        )}

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
                      <Card className="border-0 shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                        <CardContent className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="w-5 h-5 text-blue-600" />
                            <span className="text-sm font-medium text-blue-700">Salario Bruto</span>
                          </div>
                          <p className="text-3xl font-bold text-blue-900">
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

                      <Card className="border-0 shadow-lg bg-gradient-to-br from-amber-50 to-orange-50">
                        <CardContent className="p-5">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 className="w-5 h-5 text-amber-600" />
                            <span className="text-sm font-medium text-amber-700">Coste Empresa</span>
                          </div>
                          <p className="text-3xl font-bold text-amber-900">
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
                            <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                              <Building2 className="w-4 h-4 text-blue-600" />
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
                    <div className="h-[60vh]">
                      <iframe
                        src={viewerDocument.pdfUrl}
                        className="w-full h-full rounded-xl border-2 border-slate-200"
                        title="PDF Viewer"
                      />
                    </div>
                  </TabsContent>
                </Tabs>
              ) : (
                <div className="h-[60vh]">
                  <iframe
                    src={viewerDocument?.pdfUrl}
                    className="w-full h-full rounded-xl border-2 border-slate-200"
                    title="PDF Viewer"
                  />
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

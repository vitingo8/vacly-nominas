'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Upload, FileText, Download, Eye, Brain, CheckCircle, FileSpreadsheet, Loader2, DollarSign, TrendingUp, CreditCard, Building2 } from 'lucide-react'

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

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Reset state
    setSplitDocuments([])
    setSelectedDocument(null)
    setUploadProgress(0)
    setProgressMessage('')
    setCurrentPage(null)
    setTotalPages(null)

    setIsUploading(true)

    try {
      // Upload file to Supabase Storage
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

      // Process with LUX engine
      const processResponse = await fetch('/api/process-lux', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filename: uploadResult.filename,
          url: uploadResult.url,
        }),
      })

      if (!processResponse.ok) {
        let errorMessage = `Failed to process PDF (${processResponse.status} ${processResponse.statusText})`
        try {
          // Intentar leer el texto primero
          const errorText = await processResponse.text()
          if (errorText) {
            try {
              const errorData = JSON.parse(errorText)
              errorMessage = errorData.error || errorData.details || errorMessage
            } catch {
              // Si no es JSON, usar el texto directamente si tiene contenido útil
              if (errorText.length < 200) {
                errorMessage = errorText
              }
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
    // Skip if already successfully processed
    if (document.claudeProcessed && document.nominaData) {
      console.log('⏭️ Document already successfully processed, skipping')
      return
    }

    setIsProcessingClaude(document.id)

    try {
      // Validar que tengamos ID
      if (!document.id) {
        throw new Error('Documento sin ID válido')
      }

      // Si no tiene textContent, intentar usar el filename/URL para reprocesar el PDF
      let textContent = document.textContent
      let requestBody: any = { documentId: document.id }

      if (!textContent) {
        console.warn('⚠️ Documento sin textContent, intentando reprocesar desde PDF...')
        // Si no tenemos textContent, no podemos procesar como individual
        // Esto requeriría re-descargar el PDF completo, lo cual no es ideal
        throw new Error(
          'No hay contenido de texto disponible. Por favor, vuelve a subir el PDF completo.'
        )
      }

      requestBody.textContent = textContent

      console.log('📨 Enviando documento a Claude:', { documentId: document.id, textLength: textContent.length })

      // Use the LUX processing endpoint for individual documents
      const response = await fetch('/api/process-lux', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        const errorMsg = errorData.error || errorData.details || `HTTP ${response.status}`
        throw new Error(errorMsg)
      }

      const result = await response.json()

      if (result.success && result.data?.processedData) {
        // Update document with processed data
        setSplitDocuments(prev =>
          prev.map(doc =>
            doc.id === document.id
              ? {
                  ...doc,
                  claudeProcessed: true,
                  nominaData: result.data.processedData
                }
              : doc
          )
        )
        console.log('✅ Documento procesado exitosamente:', result.data.processedData)
      } else {
        console.warn('⚠️ Respuesta inesperada:', result)
        throw new Error(result.error || 'Sin datos en la respuesta de Claude')
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error desconocido'
      console.error('❌ Error procesando con Claude:', {
        documentId: document.id,
        error: errorMsg,
        hasTextContent: !!document.textContent
      })
      alert(`Error procesando documento:\n\n${errorMsg}\n\nIntenta cargar el PDF nuevamente.`)
    } finally {
      setIsProcessingClaude(null)
    }
  }

  const handleBatchProcess = async () => {
    if (splitDocuments.length === 0) return

    setIsBatchProcessing(true)
    setBatchProgress(0)

    const unprocessedDocs = splitDocuments.filter(doc => !doc.claudeProcessed)

    for (let i = 0; i < unprocessedDocs.length; i++) {
      const doc = unprocessedDocs[i]

      try {
        await handleProcessWithClaude(doc)
        setBatchProgress(((i + 1) / unprocessedDocs.length) * 100)
      } catch (error) {
        console.error(`Error processing document ${doc.id}:`, error)
      }
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
        headers: {
          'Content-Type': 'application/json',
        },
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

  return (
    <div className="min-h-screen bg-[#f6f8fa] p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Upload Section */}
        <Card className="mb-6 border-none shadow-lg bg-white mt-0">
          <CardHeader className="bg-gradient-to-r from-[#1B2A41] to-[#2d4057] text-white rounded-t-lg">
            <CardTitle className="flex items-center gap-2 text-xl">
              <Upload className="h-6 w-6" />
              Procesar Nóminas PDF
            </CardTitle>
            <CardDescription className="text-white/80">
              Procesamiento automático con Claude 4.5 Haiku en paralelo
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="pdf-upload" className="cursor-pointer">
                  <div className="flex items-center justify-center gap-3 bg-[#C6A664] text-white px-8 py-4 rounded-xl hover:bg-[#B8964A] transition-all shadow-md hover:shadow-xl font-semibold text-lg">
                    <Upload className="h-6 w-6" />
                    <span>Seleccionar Archivo PDF</span>
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

              {isUploading && (
                <div className="space-y-3 bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[#1B2A41]">Procesando documento...</span>
                    <span className="text-sm font-bold text-[#C6A664]">
                      {currentPage && totalPages ? `${currentPage}/${totalPages} páginas` : ''}
                    </span>
                  </div>
                  <Progress value={uploadProgress} className="w-full h-3" />
                  <p className="text-sm text-gray-700 font-medium">{progressMessage}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {splitDocuments.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Documents List */}
            <div className="lg:col-span-1">
              <Card className="border-none shadow-lg bg-white">
                <CardHeader className="bg-gradient-to-r from-[#C6A664] to-[#d4b66e] text-white rounded-t-lg">
                  <CardTitle className="flex items-center justify-between text-lg">
                    <span className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Documentos ({splitDocuments.length})
                    </span>
                    <Badge className="bg-white/20 text-white border-white/30">
                      {processedCount} ✓
                    </Badge>
                  </CardTitle>

                  {/* Batch Actions */}
                  <div className="flex gap-2 pt-3">
                    <Button
                      onClick={handleExportExcel}
                      disabled={isExportingExcel || processedCount === 0}
                      className="flex-1 bg-white text-[#C6A664] hover:bg-white/90 font-semibold shadow-md"
                    >
                      {isExportingExcel ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Exportando...
                        </>
                      ) : (
                        <>
                          <FileSpreadsheet className="h-4 w-4 mr-2" />
                          Exportar Excel
                        </>
                      )}
                    </Button>
                  </div>

                  {isBatchProcessing && (
                    <div className="pt-3 bg-white/10 rounded-md p-2 mt-2">
                      <Progress value={batchProgress} className="w-full h-2" />
                      <p className="text-xs text-white/90 mt-1 font-medium">
                        Procesando: {Math.round(batchProgress)}%
                      </p>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 max-h-96 overflow-y-auto">
                  {splitDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                        selectedDocument?.id === doc.id
                          ? 'border-primary bg-primary/10'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedDocument(doc)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <p className="font-medium text-sm truncate">
                            Página {doc.pageNumber}
                          </p>
                          <p className="text-xs text-gray-500 truncate">
                            {doc.filename}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {doc.claudeProcessed && (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          )}
                          <Button
                            onClick={(e) => {
                              e.stopPropagation()
                              if (!doc.claudeProcessed) {
                                handleProcessWithClaude(doc)
                              }
                            }}
                            disabled={doc.claudeProcessed || isProcessingClaude === doc.id}
                            size="sm"
                            variant={doc.claudeProcessed ? "secondary" : "default"}
                          >
                            {isProcessingClaude === doc.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : doc.claudeProcessed ? (
                              <CheckCircle className="h-3 w-3" />
                            ) : (
                              <Brain className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Document Viewer */}
            <div className="lg:col-span-2">
              {selectedDocument ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Página {selectedDocument.pageNumber}</span>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => openViewer(selectedDocument)}
                          size="sm"
                          className="bg-[#C6A664] hover:bg-[#B8964A] text-white"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver Documento Completo
                        </Button>
                        <a
                          href={selectedDocument.pdfUrl}
                          download
                          className="inline-flex"
                        >
                          <Button size="sm" variant="outline">
                            <Download className="h-4 w-4 mr-2" />
                            Descargar
                          </Button>
                        </a>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selectedDocument.claudeProcessed && selectedDocument.nominaData ? (
                      <Tabs defaultValue="resumen" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                          <TabsTrigger value="resumen">Resumen</TabsTrigger>
                          <TabsTrigger value="percepciones">Percepciones</TabsTrigger>
                          <TabsTrigger value="deducciones">Deducciones</TabsTrigger>
                          <TabsTrigger value="contribuciones">Contribuciones</TabsTrigger>
                        </TabsList>

                        {/* Tab: Resumen */}
                        <TabsContent value="resumen" className="space-y-4">
                          {/* Cards de Estadísticas */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <Card className="border-none shadow-md bg-gradient-to-br from-blue-50 to-blue-100">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#1B2A41]" style={{fontFamily: 'Inter'}}>
                                  <DollarSign className="h-5 w-5 text-blue-600" />
                                  Salario Bruto
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-3xl font-bold text-blue-700" style={{fontFamily: 'Inter'}}>
                                  €{(selectedDocument.nominaData.gross_salary || 0).toFixed(2)}
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="border-none shadow-md bg-gradient-to-br from-green-50 to-emerald-100">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#1B2A41]" style={{fontFamily: 'Inter'}}>
                                  <CreditCard className="h-5 w-5 text-green-600" />
                                  Salario Neto
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-3xl font-bold text-green-700" style={{fontFamily: 'Inter'}}>
                                  €{selectedDocument.nominaData.net_pay.toFixed(2)}
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="border-none shadow-md bg-gradient-to-br from-amber-50 to-yellow-100">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#1B2A41]" style={{fontFamily: 'Inter'}}>
                                  <TrendingUp className="h-5 w-5 text-[#C6A664]" />
                                  Coste Empresa
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-3xl font-bold text-[#C6A664]" style={{fontFamily: 'Inter'}}>
                                  €{selectedDocument.nominaData.cost_empresa.toFixed(2)}
                                </div>
                              </CardContent>
                            </Card>

                            <Card className="border-none shadow-md bg-gradient-to-br from-slate-50 to-gray-100">
                              <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-semibold flex items-center gap-2 text-[#1B2A41]" style={{fontFamily: 'Inter'}}>
                                  <Building2 className="h-5 w-5 text-[#1B2A41]" />
                                  Base SS
                                </CardTitle>
                              </CardHeader>
                              <CardContent>
                                <div className="text-3xl font-bold text-[#1B2A41]" style={{fontFamily: 'Inter'}}>
                                  €{selectedDocument.nominaData.base_ss.toFixed(2)}
                                </div>
                              </CardContent>
                            </Card>
                          </div>

                          {/* Datos del Empleado y Empresa */}
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base" style={{fontFamily: 'Inter'}}>Datos del Empleado</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">Nombre:</span>
                                  <span className="text-sm">{selectedDocument.nominaData.employee.name || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">DNI:</span>
                                  <span className="text-sm">{selectedDocument.nominaData.employee.dni || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">NSS:</span>
                                  <span className="text-sm">{selectedDocument.nominaData.employee.nss || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">Categoría:</span>
                                  <span className="text-sm">{selectedDocument.nominaData.employee.category || 'N/A'}</span>
                                </div>
                              </CardContent>
                            </Card>

                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base" style={{fontFamily: 'Inter'}}>Datos de la Empresa</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">Empresa:</span>
                                  <span className="text-sm">{selectedDocument.nominaData.company.name || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">CIF:</span>
                                  <span className="text-sm">{selectedDocument.nominaData.company.cif || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">Período:</span>
                                  <span className="text-sm">{selectedDocument.nominaData.period_start} - {selectedDocument.nominaData.period_end}</span>
                                </div>
                                <div className="flex justify-between" style={{fontFamily: 'Inter'}}>
                                  <span className="text-sm font-medium">IBAN:</span>
                                  <span className="text-sm text-xs">{selectedDocument.nominaData.iban || 'N/A'}</span>
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </TabsContent>

                        {/* Tab: Percepciones */}
                        <TabsContent value="percepciones">
                          <Card>
                            <CardHeader>
                              <CardTitle>Percepciones ({selectedDocument.nominaData.perceptions?.length || 0})</CardTitle>
                              <CardDescription>Detalle de todos los ingresos y complementos</CardDescription>
                            </CardHeader>
                            <CardContent>
                              {selectedDocument.nominaData.perceptions && selectedDocument.nominaData.perceptions.length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Concepto</TableHead>
                                      <TableHead>Código</TableHead>
                                      <TableHead className="text-right">Importe</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedDocument.nominaData.perceptions.map((perception, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="font-medium">{perception.concept || 'N/A'}</TableCell>
                                        <TableCell>{perception.code || '-'}</TableCell>
                                        <TableCell className="text-right font-mono">€{(perception.amount || 0).toFixed(2)}</TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/50">
                                      <TableCell colSpan={2} className="font-bold">Total Percepciones</TableCell>
                                      <TableCell className="text-right font-bold font-mono">
                                        €{selectedDocument.nominaData.perceptions.reduce((sum, p) => sum + (p.amount || 0), 0).toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              ) : (
                                <p className="text-center text-muted-foreground py-8">No hay percepciones registradas</p>
                              )}
                            </CardContent>
                          </Card>
                        </TabsContent>

                        {/* Tab: Deducciones */}
                        <TabsContent value="deducciones">
                          <Card>
                            <CardHeader>
                              <CardTitle>Deducciones ({selectedDocument.nominaData.deductions?.length || 0})</CardTitle>
                              <CardDescription>Detalle de retenciones y descuentos</CardDescription>
                            </CardHeader>
                            <CardContent>
                              {selectedDocument.nominaData.deductions && selectedDocument.nominaData.deductions.length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Concepto</TableHead>
                                      <TableHead>Código</TableHead>
                                      <TableHead className="text-right">Importe</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedDocument.nominaData.deductions.map((deduction, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="font-medium">{deduction.concept || 'N/A'}</TableCell>
                                        <TableCell>{deduction.code || '-'}</TableCell>
                                        <TableCell className="text-right font-mono text-red-600">-€{(deduction.amount || 0).toFixed(2)}</TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/50">
                                      <TableCell colSpan={2} className="font-bold">Total Deducciones</TableCell>
                                      <TableCell className="text-right font-bold font-mono text-red-600">
                                        -€{selectedDocument.nominaData.deductions.reduce((sum, d) => sum + (d.amount || 0), 0).toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              ) : (
                                <p className="text-center text-muted-foreground py-8">No hay deducciones registradas</p>
                              )}
                            </CardContent>
                          </Card>
                        </TabsContent>

                        {/* Tab: Contribuciones */}
                        <TabsContent value="contribuciones">
                          <Card>
                            <CardHeader>
                              <CardTitle>Contribuciones Sociales ({selectedDocument.nominaData.contributions?.length || 0})</CardTitle>
                              <CardDescription>Cotizaciones a cargo de la empresa</CardDescription>
                            </CardHeader>
                            <CardContent>
                              {selectedDocument.nominaData.contributions && selectedDocument.nominaData.contributions.length > 0 ? (
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Concepto</TableHead>
                                      <TableHead className="text-right">Base</TableHead>
                                      <TableHead className="text-right">Tipo %</TableHead>
                                      <TableHead className="text-right">Contribución Empresa</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {selectedDocument.nominaData.contributions.map((contribution, index) => (
                                      <TableRow key={index}>
                                        <TableCell className="font-medium">{contribution.concept || 'N/A'}</TableCell>
                                        <TableCell className="text-right font-mono">€{(contribution.base || 0).toFixed(2)}</TableCell>
                                        <TableCell className="text-right">{contribution.rate ? (contribution.rate * 100).toFixed(2) + '%' : '-'}</TableCell>
                                        <TableCell className="text-right font-mono text-orange-600">€{(contribution.employer_contribution || 0).toFixed(2)}</TableCell>
                                      </TableRow>
                                    ))}
                                    <TableRow className="bg-muted/50">
                                      <TableCell colSpan={3} className="font-bold">Total Contribuciones Empresa</TableCell>
                                      <TableCell className="text-right font-bold font-mono text-orange-600">
                                        €{selectedDocument.nominaData.contributions.reduce((sum, c) => sum + (c.employer_contribution || 0), 0).toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  </TableBody>
                                </Table>
                              ) : (
                                <p className="text-center text-muted-foreground py-8">No hay contribuciones registradas</p>
                              )}
                            </CardContent>
                          </Card>
                        </TabsContent>
                      </Tabs>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-yellow-800">
                          ⏳ Este documento aún no ha sido procesado con IA.
                          Haz clic en el botón de cerebro para procesarlo.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex items-center justify-center h-64">
                    <p className="text-gray-500">
                      Selecciona un documento para ver su contenido
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Viewer Dialog */}
        <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
          <DialogContent className="max-w-5xl h-[85vh]">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold text-[#1B2A41]">
                📄 Página {viewerDocument?.pageNumber}
              </DialogTitle>
              <DialogDescription className="text-base">
                {viewerDocument?.filename}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 h-full">
              {viewerDocument && (
                <iframe
                  src={viewerDocument.pdfUrl}
                  className="w-full h-[calc(85vh-120px)] border-2 border-[#C6A664]/20 rounded-lg"
                  title="PDF Viewer"
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
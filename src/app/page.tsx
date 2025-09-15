'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, Download, Eye, Brain, CheckCircle, FileSpreadsheet, Loader2 } from 'lucide-react'

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

type ViewMode = 'pdf' | 'text'

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
  const [viewMode, setViewMode] = useState<ViewMode>('pdf')
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
      formData.append('file', file)

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
        throw new Error('Failed to process PDF')
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
    setIsProcessingClaude(document.id)

    try {
      // Use the LUX processing endpoint for individual documents
      const response = await fetch('/api/process-lux', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textContent: document.textContent,
          documentId: document.id,
        }),
      })

      const result = await response.json()

      if (response.ok) {
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
      } else {
        alert(`Error procesando con Claude: ${result.error}`)
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

  const openViewer = (document: SplitDocument, mode: ViewMode = 'pdf') => {
    setViewerDocument(document)
    setViewMode(mode)
    setIsViewerOpen(true)
  }

  const processedCount = splitDocuments.filter(doc => doc.claudeProcessed).length

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Simple */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            🏢 Vacly Nóminas LUX
          </h1>
          <p className="text-xl text-gray-600">
            Procesamiento avanzado de nóminas con Claude 3.5 Haiku
          </p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Subir y Procesar PDF de Nóminas
            </CardTitle>
            <CardDescription>
              Sube un archivo PDF con nóminas para dividir, extraer texto y procesar con IA
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pdf-upload">Seleccionar archivo PDF</Label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="mt-2"
                />
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Progreso</span>
                    <span className="text-sm text-gray-500">
                      {currentPage && totalPages ? `${currentPage}/${totalPages} páginas` : ''}
                    </span>
                  </div>
                  <Progress value={uploadProgress} className="w-full" />
                  <p className="text-sm text-gray-600">{progressMessage}</p>
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
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Documentos ({splitDocuments.length})</span>
                    <Badge variant="secondary">
                      {processedCount} procesados
                    </Badge>
                  </CardTitle>

                  {/* Batch Actions */}
                  <div className="flex gap-2 pt-2">
                    <Button
                      onClick={handleBatchProcess}
                      disabled={isBatchProcessing || splitDocuments.every(doc => doc.claudeProcessed)}
                      size="sm"
                      className="flex-1"
                    >
                      {isBatchProcessing ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Procesando...
                        </>
                      ) : (
                        <>
                          <Brain className="h-4 w-4 mr-2" />
                          Procesar Todos
                        </>
                      )}
                    </Button>

                    <Button
                      onClick={handleExportExcel}
                      disabled={isExportingExcel || processedCount === 0}
                      size="sm"
                      variant="outline"
                    >
                      {isExportingExcel ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <FileSpreadsheet className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {isBatchProcessing && (
                    <div className="pt-2">
                      <Progress value={batchProgress} className="w-full" />
                      <p className="text-xs text-gray-500 mt-1">
                        Procesamiento en lotes: {Math.round(batchProgress)}%
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
                          ? 'border-blue-500 bg-blue-50'
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
                          onClick={() => openViewer(selectedDocument, 'pdf')}
                          size="sm"
                          variant="outline"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver PDF
                        </Button>
                        <Button
                          onClick={() => openViewer(selectedDocument, 'text')}
                          size="sm"
                          variant="outline"
                        >
                          <FileText className="h-4 w-4 mr-2" />
                          Ver Texto
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
                      <div className="space-y-4">
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <h3 className="font-semibold text-green-800 mb-2">✅ Procesado con IA</h3>
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p><strong>Empleado:</strong> {selectedDocument.nominaData.employee.name}</p>
                              <p><strong>DNI:</strong> {selectedDocument.nominaData.employee.dni}</p>
                              <p><strong>Empresa:</strong> {selectedDocument.nominaData.company.name}</p>
                            </div>
                            <div>
                              <p><strong>Período:</strong> {selectedDocument.nominaData.period_start} - {selectedDocument.nominaData.period_end}</p>
                              <p><strong>Neto:</strong> €{selectedDocument.nominaData.net_pay}</p>
                              <p><strong>Coste Empresa:</strong> €{selectedDocument.nominaData.cost_empresa}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                        <p className="text-yellow-800">
                          ⏳ Este documento aún no ha sido procesado con IA.
                          Haz clic en el botón de cerebro para procesarlo.
                        </p>
                      </div>
                    )}

                    {/* Text Preview */}
                    <div className="mt-4">
                      <h4 className="font-medium mb-2">Vista previa del texto:</h4>
                      <div className="bg-gray-50 border rounded-lg p-4 max-h-64 overflow-y-auto">
                        <pre className="text-sm whitespace-pre-wrap text-gray-700">
                          {selectedDocument.textContent.substring(0, 1000)}
                          {selectedDocument.textContent.length > 1000 && '...'}
                        </pre>
                      </div>
                    </div>
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
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>
                {viewMode === 'pdf' ? 'Visor PDF' : 'Contenido de Texto'} - Página {viewerDocument?.pageNumber}
              </DialogTitle>
              <DialogDescription>
                {viewerDocument?.filename}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4">
              {viewMode === 'pdf' && viewerDocument ? (
                <iframe
                  src={viewerDocument.pdfUrl}
                  className="w-full h-96 border rounded-lg"
                  title="PDF Viewer"
                />
              ) : (
                <div className="bg-gray-50 border rounded-lg p-4 max-h-96 overflow-y-auto">
                  <pre className="text-sm whitespace-pre-wrap">
                    {viewerDocument?.textContent}
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
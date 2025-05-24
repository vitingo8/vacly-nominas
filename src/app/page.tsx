'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Upload, FileText, Download, Eye, FileImage, Type, Brain, CheckCircle, FileSpreadsheet, Zap, Database, TrendingUp, Clock, Hash } from 'lucide-react'

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
  pdfPath: string
  textPath: string
  claudeProcessed?: boolean
  nominaData?: NominaData
  pdfUrl: string
  textUrl: string
}

type ViewMode = 'pdf' | 'text'

export default function Home() {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [splitDocuments, setSplitDocuments] = useState<SplitDocument[]>([])
  const [selectedDocument, setSelectedDocument] = useState<SplitDocument | null>(null)
  const [isViewerOpen, setIsViewerOpen] = useState(false)
  const [viewerDocument, setViewerDocument] = useState<SplitDocument | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('pdf')
  const [isProcessingClaude, setIsProcessingClaude] = useState<string | null>(null)
  const [isBatchProcessing, setIsBatchProcessing] = useState(false)
  const [isExportingExcel, setIsExportingExcel] = useState(false)
  const [batchProgress, setBatchProgress] = useState(0)
  const [memoryStatus, setMemoryStatus] = useState<any>(null)
  const [isLoadingMemory, setIsLoadingMemory] = useState(false)

  // Load memory status on component mount
  useEffect(() => {
    loadMemoryStatus()
  }, [])

  const loadMemoryStatus = async () => {
    setIsLoadingMemory(true)
    try {
      const response = await fetch('/api/memory-status')
      const result = await response.json()
      
      if (response.ok) {
        setMemoryStatus(result.data)
      } else {
        console.error('Error loading memory status:', result.error)
      }
    } catch (error) {
      console.error('Error loading memory status:', error)
    } finally {
      setIsLoadingMemory(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || file.type !== 'application/pdf') {
      alert('Please select a PDF file')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)

    const formData = new FormData()
    formData.append('pdf', file)

    try {
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error('Upload failed')
      }

      const uploadResult = await uploadResponse.json()
      setUploadProgress(50)

      // Process the uploaded PDF
      const processResponse = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename: uploadResult.filename,
          url: uploadResult.url 
        }),
      })

      if (!processResponse.ok) {
        throw new Error('Processing failed')
      }

      const processResult = await processResponse.json()
      setSplitDocuments(processResult.documents)
      setUploadProgress(100)

    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred during upload or processing')
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      URL.revokeObjectURL(objectUrl)
    } catch (error) {
      console.error('Download error:', error)
      alert('Failed to download file')
    }
  }

  const openViewer = (document: SplitDocument) => {
    setViewerDocument(document)
    setIsViewerOpen(true)
    setViewMode('pdf') // Default to PDF view
  }

  const processWithClaude = async (document: SplitDocument) => {
    if (!document.textContent.trim()) {
      alert('No text content found in this document to process')
      return
    }

    setIsProcessingClaude(document.id)

    try {
      const response = await fetch('/api/process-nomina', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          textContent: document.textContent,
          documentId: document.id
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to process with Claude')
      }

      // Update the document with processed data
      setSplitDocuments(prevDocs => 
        prevDocs.map(doc => 
          doc.id === document.id 
            ? { 
                ...doc, 
                claudeProcessed: true, 
                nominaData: result.data 
              }
            : doc
        )
      )

      // Update viewer document if it's the same one
      if (viewerDocument?.id === document.id) {
        setViewerDocument({
          ...viewerDocument,
          claudeProcessed: true,
          nominaData: result.data
        })
      }

      // Update selected document if it's the same one
      if (selectedDocument?.id === document.id) {
        setSelectedDocument({
          ...selectedDocument,
          claudeProcessed: true,
          nominaData: result.data
        })
      }

      // Refresh memory status to show updated patterns and embeddings
      loadMemoryStatus()

      alert('¡Nómina procesada y guardada en Supabase exitosamente!')

    } catch (error) {
      console.error('Error processing with Claude:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessingClaude(null)
    }
  }

  const processAllWithClaude = async () => {
    const unprocessedDocs = splitDocuments.filter(doc => !doc.claudeProcessed && doc.textContent?.trim())
    
    if (unprocessedDocs.length === 0) {
      alert('No hay documentos sin procesar disponibles')
      return
    }

    const confirmProcess = confirm(`¿Quieres procesar ${unprocessedDocs.length} documentos con Claude AI? Esto puede tardar unos minutos.`)
    if (!confirmProcess) return

    setIsBatchProcessing(true)
    setBatchProgress(0)

    try {
      // Process documents one by one to show progress
      const results = []
      const errors = []

      for (let i = 0; i < unprocessedDocs.length; i++) {
        const doc = unprocessedDocs[i]
        setBatchProgress(Math.round((i / unprocessedDocs.length) * 100))

        try {
          const response = await fetch('/api/process-nomina', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              textContent: doc.textContent,
              documentId: doc.id
            }),
          })

          const result = await response.json()

          if (response.ok) {
            results.push({
              documentId: doc.id,
              success: true,
              data: result.data
            })

            // Update the document immediately
            setSplitDocuments(prevDocs => 
              prevDocs.map(prevDoc => 
                prevDoc.id === doc.id 
                  ? { 
                      ...prevDoc, 
                      claudeProcessed: true, 
                      nominaData: result.data 
                    }
                  : prevDoc
              )
            )
          } else {
            errors.push({
              documentId: doc.id,
              filename: doc.filename,
              error: result.error
            })
          }
        } catch (error) {
          errors.push({
            documentId: doc.id,
            filename: doc.filename,
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        }

        // Small delay to avoid overwhelming the API
        if (i < unprocessedDocs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      }

      setBatchProgress(100)

      // Refresh memory status after batch processing
      loadMemoryStatus()

      const successMessage = `¡Procesamiento completado!\n\n` +
        `✅ Procesados exitosamente: ${results.length}\n` +
        `❌ Errores: ${errors.length}\n\n` +
        `Todos los datos se han guardado en Supabase y la memoria AI se ha actualizado.`

      if (errors.length > 0) {
        console.log('Errores encontrados:', errors)
      }

      alert(successMessage)

    } catch (error) {
      console.error('Error in batch processing:', error)
      alert(`Error en procesamiento por lotes: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsBatchProcessing(false)
      setBatchProgress(0)
    }
  }

  const exportToExcel = async () => {
    setIsExportingExcel(true)

    try {
      const response = await fetch('/api/export-excel', {
        method: 'GET',
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to export to Excel')
      }

      // Create download link
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Get filename from response headers or use default
      const contentDisposition = response.headers.get('content-disposition')
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `nominas_export_${new Date().toISOString().split('T')[0]}.xlsx`
      
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      alert('¡Excel exportado exitosamente!')

    } catch (error) {
      console.error('Error exporting to Excel:', error)
      alert(`Error al exportar a Excel: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsExportingExcel(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            PDF Splitter & Text Extractor + Claude AI
          </h1>
          <p className="text-lg text-gray-600">
            Upload a PDF, split it into individual pages, extract text content, and process payrolls with Claude AI
          </p>
        </div>

        {/* Upload Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Upload PDF
            </CardTitle>
            <CardDescription>
              Select a PDF file to split into individual pages and extract text
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pdf-upload">Choose PDF File</Label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="cursor-pointer"
                />
              </div>

              {isUploading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Processing...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {splitDocuments.length > 0 && (
          <div className="space-y-6">
            {/* Action Buttons */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Acciones Masivas
                </CardTitle>
                <CardDescription>
                  Procesa todos los documentos o exporta los datos existentes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <Button
                    onClick={processAllWithClaude}
                    disabled={isBatchProcessing || splitDocuments.filter(doc => !doc.claudeProcessed && doc.textContent?.trim()).length === 0}
                    size="lg"
                    className="flex items-center gap-2"
                  >
                    {isBatchProcessing ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Brain className="w-5 h-5" />
                    )}
                    {isBatchProcessing 
                      ? 'Procesando...' 
                      : `Procesar Todo con Claude (${splitDocuments.filter(doc => !doc.claudeProcessed && doc.textContent?.trim()).length} pendientes)`
                    }
                  </Button>
                  
                  <Button
                    onClick={exportToExcel}
                    disabled={isExportingExcel}
                    size="lg"
                    variant="secondary"
                    className="flex items-center gap-2"
                  >
                    {isExportingExcel ? (
                      <div className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-5 h-5" />
                    )}
                    {isExportingExcel ? 'Exportando...' : 'Exportar a Excel'}
                  </Button>
                </div>

                {isBatchProcessing && (
                  <div className="mt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Procesando documentos con Claude AI...</span>
                      <span>{batchProgress}%</span>
                    </div>
                    <Progress value={batchProgress} className="w-full" />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Document List */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Split Documents ({splitDocuments.length} pages)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {splitDocuments.map((doc) => (
                      <div key={doc.id} className="p-4 border rounded-lg bg-white shadow-sm">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-medium">{doc.filename}</h3>
                              {doc.claudeProcessed && (
                                <CheckCircle className="w-4 h-4 text-green-500" aria-label="Processed with Claude" />
                              )}
                            </div>
                            <p className="text-sm text-gray-500">Page {doc.pageNumber}</p>
                            {doc.claudeProcessed && (
                              <p className="text-xs text-green-600 mt-1">✅ Processed & Saved to Supabase</p>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(doc.pdfUrl, doc.filename)}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(doc.textUrl, doc.filename.replace('.pdf', '.txt'))}
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              Text
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openViewer(doc)}
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              View
                            </Button>
                            {!doc.claudeProcessed && !isProcessingClaude && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => processWithClaude(doc)}
                                disabled={isProcessingClaude === doc.id}
                              >
                                <Brain className="w-4 h-4 mr-1" />
                                Claude
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Text Viewer */}
              <Card>
                <CardHeader>
                  <CardTitle>
                    {selectedDocument ? (
                      <div className="flex items-center gap-2">
                        <span>{selectedDocument.filename}</span>
                        {selectedDocument.claudeProcessed && (
                          <CheckCircle className="w-5 h-5 text-green-500" />
                        )}
                      </div>
                    ) : (
                      'Select a document to view content'
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedDocument ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">
                          Page {selectedDocument.pageNumber}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              downloadFile(selectedDocument.textUrl, `${selectedDocument.filename}.txt`)
                            }
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Download Text
                          </Button>
                          {!selectedDocument.claudeProcessed && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => processWithClaude(selectedDocument)}
                              disabled={isProcessingClaude === selectedDocument.id}
                            >
                              {isProcessingClaude === selectedDocument.id ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              ) : (
                                <Brain className="w-4 h-4 mr-2" />
                              )}
                              Process with Claude
                            </Button>
                          )}
                        </div>
                      </div>

                      {selectedDocument.claudeProcessed && (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-green-700 font-medium mb-2">
                            <CheckCircle className="w-5 h-5" />
                            Processed with Claude AI
                          </div>
                          <p className="text-sm text-green-600">
                            Nómina ID: {selectedDocument.nominaData?.nominaId}
                          </p>
                          <p className="text-sm text-green-600">
                            Saved to Supabase successfully
                          </p>
                        </div>
                      )}

                      <div className="bg-gray-50 p-4 rounded-lg max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm">
                          {selectedDocument.textContent || 'No text content found on this page.'}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">
                      Select a document from the list to view its text content
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Memory Status Panel */}
        {memoryStatus && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                RAG Memory Status
              </CardTitle>
              <CardDescription>
                Current state of AI memory and learned patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-blue-700 font-medium">
                    <Brain className="w-4 h-4" />
                    Memory Patterns
                  </div>
                  <p className="text-2xl font-bold text-blue-900 mt-1">
                    {memoryStatus.summary.total_memories}
                  </p>
                  <p className="text-sm text-blue-600">
                    Avg. Confidence: {(memoryStatus.summary.avg_confidence * 100).toFixed(1)}%
                  </p>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-green-700 font-medium">
                    <Hash className="w-4 h-4" />
                    Vector Embeddings
                  </div>
                  <p className="text-2xl font-bold text-green-900 mt-1">
                    {memoryStatus.summary.total_embeddings}
                  </p>
                  <p className="text-sm text-green-600">
                    Text chunks indexed
                  </p>
                </div>
                
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-purple-700 font-medium">
                    <FileText className="w-4 h-4" />
                    Documents Processed
                  </div>
                  <p className="text-2xl font-bold text-purple-900 mt-1">
                    {memoryStatus.summary.total_processed}
                  </p>
                  <p className="text-sm text-purple-600">
                    Total processed docs
                  </p>
                </div>
                
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-orange-700 font-medium">
                    <TrendingUp className="w-4 h-4" />
                    Performance
                  </div>
                  <p className="text-2xl font-bold text-orange-900 mt-1">
                    {memoryStatus.memory_patterns.reduce((acc: number, pattern: any) => acc + (pattern.usage_count || 0), 0)}
                  </p>
                  <p className="text-sm text-orange-600">
                    Total pattern usage
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Learned Patterns */}
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    Learned Patterns
                  </h4>
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {memoryStatus.memory_patterns.length > 0 ? (
                      memoryStatus.memory_patterns.map((pattern: any, index: number) => (
                        <div key={pattern.id} className="bg-gray-50 rounded-lg p-3 border">
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-medium text-sm text-gray-700">
                              {pattern.document_types?.name || 'Unknown'} Pattern
                            </span>
                            <div className="flex items-center gap-2 text-xs text-gray-500">
                              <TrendingUp className="w-3 h-3" />
                              {(pattern.confidence_score * 100).toFixed(0)}%
                            </div>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">
                            {pattern.summary}
                          </p>
                          {pattern.keywords && pattern.keywords.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {pattern.keywords.slice(0, 5).map((keyword: string, kIndex: number) => (
                                <span key={kIndex} className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded">
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="flex justify-between items-center mt-2 text-xs text-gray-500">
                            <span>Used {pattern.usage_count} times</span>
                            <span>
                              <Clock className="w-3 h-3 inline mr-1" />
                              {new Date(pattern.last_used_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm italic">
                        No patterns learned yet. Process some documents to build memory.
                      </p>
                    )}
                  </div>
                </div>

                {/* Recent Activity */}
                <div>
                  <h4 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Recent Activity
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {memoryStatus.recent_activity.length > 0 ? (
                      memoryStatus.recent_activity.map((activity: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              activity.processing_status === 'completed' ? 'bg-green-500' :
                              activity.processing_status === 'processing' ? 'bg-yellow-500' :
                              activity.processing_status === 'error' ? 'bg-red-500' : 'bg-gray-500'
                            }`} />
                            <span className="text-sm font-medium text-gray-700">
                              {activity.original_filename}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(activity.created_at).toLocaleString()}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-500 text-sm italic">
                        No recent activity.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-between items-center">
                <p className="text-sm text-gray-600">
                  Memory system helps Claude learn from previous documents and provide better results.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadMemoryStatus}
                  disabled={isLoadingMemory}
                >
                  {isLoadingMemory ? (
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <Database className="w-4 h-4 mr-2" />
                  )}
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Enhanced Document Viewer Dialog */}
        <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
          <DialogContent className="max-w-4xl w-full h-[90vh] max-h-[90vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <div className="flex items-center justify-between">
                <DialogTitle className="text-xl flex items-center gap-2">
                  <span>{viewerDocument?.filename} - Page {viewerDocument?.pageNumber}</span>
                  {viewerDocument?.claudeProcessed && (
                    <CheckCircle className="w-5 h-5 text-green-500" />
                  )}
                </DialogTitle>
                <div className="flex items-center gap-2">
                  {/* View Mode Toggle */}
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <Button
                      size="sm"
                      variant={viewMode === 'pdf' ? 'default' : 'ghost'}
                      onClick={() => setViewMode('pdf')}
                      className="flex items-center gap-1 h-8"
                    >
                      <FileImage className="w-4 h-4" />
                      PDF
                    </Button>
                    <Button
                      size="sm"
                      variant={viewMode === 'text' ? 'default' : 'ghost'}
                      onClick={() => setViewMode('text')}
                      className="flex items-center gap-1 h-8"
                    >
                      <Type className="w-4 h-4" />
                      Text
                    </Button>
                  </div>
                  
                  {/* Claude Processing */}
                  {viewerDocument && !viewerDocument.claudeProcessed && (
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => processWithClaude(viewerDocument)}
                      disabled={isProcessingClaude === viewerDocument.id}
                    >
                      {isProcessingClaude === viewerDocument.id ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-1" />
                      ) : (
                        <Brain className="w-4 h-4 mr-1" />
                      )}
                      Claude
                    </Button>
                  )}
                  
                  {/* Download Options */}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => viewerDocument && downloadFile(viewerDocument.pdfUrl, viewerDocument.filename)}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => viewerDocument && downloadFile(viewerDocument.textUrl, `${viewerDocument.filename}.txt`)}
                  >
                    <Download className="w-4 h-4 mr-1" />
                    TXT
                  </Button>
                </div>
              </div>

              {viewerDocument?.claudeProcessed && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mt-3">
                  <div className="flex items-center gap-2 text-green-700 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Processed with Claude AI - Nómina ID: {viewerDocument.nominaData?.nominaId}
                  </div>
                </div>
              )}
            </DialogHeader>
            
            <div className="flex-1 overflow-hidden">
              {viewerDocument && (
                <>
                  {viewMode === 'pdf' ? (
                    // PDF Viewer
                    <div className="w-full h-full bg-gray-100 rounded-lg overflow-hidden">
                      <iframe
                        src={`${viewerDocument.pdfPath}#view=FitH`}
                        className="w-full h-full border-0"
                        title={`PDF Viewer - ${viewerDocument.filename}`}
                      />
                    </div>
                  ) : (
                    // Text Viewer
                    <div className="w-full h-full bg-white border rounded-lg overflow-auto">
                      <div className="p-6">
                        <div className="bg-gray-50 p-4 rounded-lg h-full overflow-auto">
                          <pre className="whitespace-pre-wrap text-sm leading-relaxed">
                            {viewerDocument.textContent || 'No text content found on this page.'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, Download, Eye, FileImage, Type, Brain, CheckCircle, FileSpreadsheet, Zap, Database, TrendingUp, Clock, Hash, Settings, AlertCircle, Star, Sparkles, Loader2 } from 'lucide-react'

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
  const [memoryMode, setMemoryMode] = useState<'basic' | 'enterprise'>('basic')
  const [showMemoryConfig, setShowMemoryConfig] = useState(false)
  const [isDeletingMemory, setIsDeletingMemory] = useState(false)

  // Load memory status on component mount
  useEffect(() => {
    if (memoryMode === 'enterprise') {
      loadMemoryStatus()
    }
  }, [memoryMode])

  const loadMemoryStatus = async () => {
    if (memoryMode !== 'enterprise') return
    
    setIsLoadingMemory(true)
    try {
      const response = await fetch('/api/memory-status')
      const result = await response.json()
      
      if (response.ok) {
        setMemoryStatus(result.data)
      } else {
        console.error('Error loading memory status:', result.error)
        setMemoryStatus(null)
      }
    } catch (error) {
      console.error('Error loading memory status:', error)
      setMemoryStatus(null)
    } finally {
      setIsLoadingMemory(false)
    }
  }

  const deleteMemoryData = async (type: string, patternId?: string) => {
    const confirmMessages = {
      'all': '¿Estás seguro de que quieres eliminar TODA la memoria empresarial? Esta acción no se puede deshacer.',
      'patterns': '¿Quieres eliminar todos los patrones aprendidos? Esto hará que el sistema olvide las estructuras específicas de tus nóminas.',
      'embeddings': '¿Quieres eliminar el índice de búsqueda semántica? Esto eliminará la capacidad de encontrar documentos similares.',
      'documents': '¿Quieres eliminar el historial de documentos procesados?'
    }

    const message = patternId ? 
      '¿Quieres eliminar este patrón específico de la memoria?' : 
      confirmMessages[type as keyof typeof confirmMessages]

    if (!confirm(message)) return

    setIsDeletingMemory(true)
    try {
      const url = patternId ? 
        `/api/memory-status?type=pattern&patternId=${patternId}` :
        `/api/memory-status?type=${type}`

      const response = await fetch(url, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (response.ok) {
        alert('✅ Datos eliminados exitosamente')
        loadMemoryStatus() // Refresh the data
      } else {
        alert(`❌ Error: ${result.error}`)
      }
    } catch (error) {
      console.error('Error deleting memory data:', error)
      alert('❌ Error al eliminar los datos')
    } finally {
      setIsDeletingMemory(false)
    }
  }

  // Helper function to generate business insights from memory data
  const generateBusinessInsights = (memoryStatus: any) => {
    if (!memoryStatus) return []

    const insights = []
    const patterns = memoryStatus.memory_patterns || []
    const totalDocs = memoryStatus.summary.total_processed || 0
    const totalEmbeddings = memoryStatus.summary.total_embeddings || 0

    // Company structure insights
    if (patterns.length > 0) {
      const companies = patterns.map((p: any) => p.extracted_data?.company?.name).filter(Boolean)
      const uniqueCompanies = [...new Set(companies)]
      if (uniqueCompanies.length > 0) {
        insights.push({
          icon: '🏢',
          title: 'Empresas Reconocidas',
          description: `Hemos aprendido la estructura de nóminas de ${uniqueCompanies.length} empresa(s)`,
          details: uniqueCompanies.slice(0, 3).join(', ') + (uniqueCompanies.length > 3 ? '...' : ''),
          value: `${uniqueCompanies.length} empresa(s)`,
          type: 'companies'
        })
      }
    }

    // Document processing speed
    if (totalDocs > 5) {
      const avgProcessingTime = totalDocs > 10 ? '5-8 segundos' : '8-15 segundos'
      insights.push({
        icon: '⚡',
        title: 'Velocidad de Procesamiento',
        description: `Cada nuevo documento se procesa en ${avgProcessingTime} gracias a la memoria`,
        details: 'La velocidad mejora automáticamente con cada documento procesado',
        value: avgProcessingTime,
        type: 'speed'
      })
    }

    // Pattern recognition
    if (patterns.length > 0) {
      const keywords = patterns.flatMap((p: any) => p.keywords || [])
      const uniqueKeywords = [...new Set(keywords)].slice(0, 5)
      insights.push({
        icon: '🧠',
        title: 'Términos Empresariales Aprendidos',
        description: `Reconocemos automáticamente ${uniqueKeywords.length} términos específicos de tu empresa`,
        details: uniqueKeywords.join(', '),
        value: `${uniqueKeywords.length} términos`,
        type: 'keywords'
      })
    }

    // Document similarity
    if (totalEmbeddings > 20) {
      const docsWithEmbeddings = Math.ceil(totalEmbeddings / 7)
      insights.push({
        icon: '🔍',
        title: 'Búsqueda Inteligente',
        description: `Podemos encontrar documentos similares entre ${docsWithEmbeddings} nóminas procesadas`,
        details: 'Esto acelera el procesamiento al reutilizar patrones conocidos',
        value: `${docsWithEmbeddings} documentos indexados`,
        type: 'search'
      })
    }

    // Accuracy improvement
    const avgConfidence = memoryStatus.summary.avg_confidence || 0.5
    if (avgConfidence > 0.7) {
      insights.push({
        icon: '🎯',
        title: 'Precisión Mejorada',
        description: `La precisión ha mejorado al ${Math.round(avgConfidence * 100)}% gracias al aprendizaje`,
        details: 'Cada documento procesado mejora la precisión del siguiente',
        value: `${Math.round(avgConfidence * 100)}% precisión`,
        type: 'accuracy'
      })
    }

    return insights
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
      // Upload phase (0-30%)
      setUploadProgress(10)
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error('Upload failed')
      }

      const uploadResult = await uploadResponse.json()
      setUploadProgress(30)

      // Processing phase (30-100%)
      setUploadProgress(40)
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

      setUploadProgress(70)
      const processResult = await processResponse.json()
      setUploadProgress(90)
      
      setSplitDocuments(processResult.documents)
      setUploadProgress(100)

      // Reset progress after a short delay
      setTimeout(() => setUploadProgress(0), 1000)

    } catch (error) {
      console.error('Error:', error)
      alert('An error occurred during upload or processing')
    } finally {
      setIsUploading(false)
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
      // Choose endpoint based on memory mode
      const endpoint = memoryMode === 'enterprise' ? '/api/process-nomina' : '/api/process-nomina-basic'
      
      const response = await fetch(endpoint, {
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

      // Refresh memory status only if in enterprise mode
      if (memoryMode === 'enterprise') {
        loadMemoryStatus()
      }

      // Show different success messages based on mode
      const successMessage = memoryMode === 'enterprise' 
        ? '¡Nómina procesada y guardada exitosamente! 🧠 La memoria empresarial se ha actualizado automáticamente.'
        : '¡Nómina procesada y guardada exitosamente! ⚡ Procesamiento básico completado.'
      
      alert(successMessage)

    } catch (error) {
      console.error('Error processing with Claude:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsProcessingClaude(null)
    }
  }

  const processBatchWithClaude = async () => {
    const unprocessedDocs = splitDocuments.filter(doc => !doc.claudeProcessed)
    
    if (unprocessedDocs.length === 0) {
      alert('No hay documentos sin procesar')
      return
    }

    setIsBatchProcessing(true)
    setBatchProgress(0)

    try {
      // Choose endpoint based on memory mode
      const endpoint = memoryMode === 'enterprise' ? '/api/process-nomina' : '/api/process-nomina-basic'
      
      // Process documents in parallel batches of 3 to avoid overwhelming the API
      const batchSize = 3
      const results: any[] = []
      const errors: any[] = []

      for (let i = 0; i < unprocessedDocs.length; i += batchSize) {
        const batch = unprocessedDocs.slice(i, i + batchSize)
        setBatchProgress(Math.round((i / unprocessedDocs.length) * 100))

        // Process batch in parallel
        const batchPromises = batch.map(async (doc) => {
          try {
            const response = await fetch(endpoint, {
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
              return {
                documentId: doc.id,
                success: true,
                data: result.data
              }
            } else {
              return {
                documentId: doc.id,
                success: false,
                filename: doc.filename,
                error: result.error
              }
            }
          } catch (error) {
            return {
              documentId: doc.id,
              success: false,
              filename: doc.filename,
              error: error instanceof Error ? error.message : 'Unknown error'
            }
          }
        })

        // Wait for all requests in this batch to complete
        const batchResults = await Promise.all(batchPromises)
        
        // Process results
        batchResults.forEach(result => {
          if (result.success) {
            results.push(result)
            // Update the document immediately
            setSplitDocuments(prevDocs => 
              prevDocs.map(prevDoc => 
                prevDoc.id === result.documentId 
                  ? { 
                      ...prevDoc, 
                      claudeProcessed: true, 
                      nominaData: result.data 
                    }
                  : prevDoc
              )
            )
          } else {
            errors.push(result)
          }
        })

        // Small delay between batches to be respectful to the API
        if (i + batchSize < unprocessedDocs.length) {
          await new Promise(resolve => setTimeout(resolve, 500))
        }
      }

      setBatchProgress(100)

      // Reload memory status if using enterprise mode
      if (memoryMode === 'enterprise') {
        await loadMemoryStatus()
      }

      // Show results
      if (results.length > 0) {
        alert(`✅ Procesamiento completado!\n\n` +
              `Documentos procesados: ${results.length}\n` +
              `Errores: ${errors.length}\n\n` +
              `Velocidad mejorada con procesamiento paralelo`)
      }

      if (errors.length > 0) {
        console.error('Batch processing errors:', errors)
        const errorMessage = errors.map(e => `${e.filename}: ${e.error}`).join('\n')
        alert(`⚠️ Algunos documentos tuvieron errores:\n\n${errorMessage}`)
      }

    } catch (error) {
      console.error('Batch processing error:', error)
      alert('Error durante el procesamiento en lote')
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-emerald-50 to-orange-50">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 via-emerald-600 to-orange-600 bg-clip-text text-transparent mb-4">
            🚀 Vacly Nóminas AI
          </h1>
          <p className="text-xl text-gray-700 max-w-3xl mx-auto">
            Procesamiento inteligente de nóminas con IA avanzada. Sube PDFs, extrae datos automáticamente y exporta a Excel con precisión profesional.
          </p>
        </div>

        {/* Compact Memory Configuration */}
        <Card className="mb-6 border border-blue-200 bg-gradient-to-r from-blue-50 to-purple-50 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xl text-gray-800">
              <Brain className="w-5 h-5 text-blue-600" />
              🧠 Configuración de Memoria
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Basic Mode */}
              <div 
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  memoryMode === 'basic' 
                    ? 'border-green-400 bg-green-50 shadow-md' 
                    : 'border-gray-200 bg-white hover:border-green-300'
                }`}
                onClick={() => setMemoryMode('basic')}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${memoryMode === 'basic' ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <h3 className="font-semibold text-green-700">Procesamiento Básico</h3>
                  <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">GRATIS</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-2">Solo Claude AI • 20-30s por documento</p>
                <p className="text-xs text-gray-500">Procesamiento estándar sin memoria empresarial</p>
              </div>

              {/* Enterprise Mode */}
              <div 
                className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                  memoryMode === 'enterprise' 
                    ? 'border-blue-400 bg-blue-50 shadow-md' 
                    : 'border-gray-200 bg-white hover:border-blue-300'
                }`}
                onClick={() => setMemoryMode('enterprise')}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-3 h-3 rounded-full ${memoryMode === 'enterprise' ? 'bg-blue-500' : 'bg-gray-300'}`} />
                  <h3 className="font-semibold text-blue-700">Memoria Empresarial</h3>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">PREMIUM</Badge>
                </div>
                <p className="text-sm text-gray-600 mb-2">Claude AI + Voyage AI • 5-10s por documento</p>
                <p className="text-xs text-gray-500">~$0.10 por 1000 documentos • Aprende patrones</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Compact Upload Section */}
        <Card className="mb-6 border border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xl text-gray-800">
              <Upload className="w-5 h-5 text-emerald-600" />
              📁 Cargar PDF
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="cursor-pointer border border-emerald-200 focus:border-emerald-400 text-sm"
                />
              </div>
              
              {isUploading && (
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between text-xs font-medium mb-1">
                    <span className="text-blue-700">🔄 Procesando...</span>
                    <span className="text-blue-600">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full h-2" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Compact Results Section */}
        {splitDocuments.length > 0 && (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Documents List - Compact */}
            <div className="xl:col-span-2">
              <Card className="border border-gray-200 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
                      <FileText className="w-5 h-5 text-blue-600" />
                      📄 Documentos ({splitDocuments.length})
                    </CardTitle>
                    <div className="flex gap-2">
                      <Button
                        onClick={processBatchWithClaude}
                        disabled={isBatchProcessing || splitDocuments.filter(doc => !doc.claudeProcessed && doc.textContent?.trim()).length === 0}
                        size="sm"
                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white shadow-md"
                      >
                        {isBatchProcessing ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Procesando...
                          </>
                        ) : (
                          <>
                            <Brain className="w-4 h-4 mr-2" />
                            Procesar Todo
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={exportToExcel}
                        disabled={isExportingExcel || splitDocuments.filter(doc => doc.claudeProcessed).length === 0}
                        size="sm"
                        variant="outline"
                        className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                      >
                        {isExportingExcel ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Exportando...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4 mr-2" />
                            Excel
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  
                  {isBatchProcessing && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs font-medium mb-1">
                        <span className="text-blue-700">🔄 Procesando lote...</span>
                        <span className="text-blue-600">{batchProgress}%</span>
                      </div>
                      <Progress value={batchProgress} className="w-full h-2" />
                    </div>
                  )}
                </CardHeader>
                <CardContent className="pt-0 max-h-96 overflow-y-auto">
                  <div className="space-y-2">
                    {splitDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className={`p-3 rounded-lg border transition-all cursor-pointer ${
                          selectedDocument?.id === doc.id
                            ? 'border-blue-400 bg-blue-50 shadow-md'
                            : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                        onClick={() => setSelectedDocument(doc)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-gray-800 truncate">
                                {doc.filename}
                              </span>
                              {doc.claudeProcessed ? (
                                <Badge variant="secondary" className="bg-green-100 text-green-700 text-xs">
                                  ✅ Procesado
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-xs">
                                  🔄 Pendiente
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">
                              Página {doc.pageNumber} • {doc.textContent?.length || 0} caracteres
                            </p>
                          </div>
                          <div className="flex gap-1 ml-2">
                            <Button
                              onClick={(e) => {
                                e.stopPropagation()
                                openViewer(doc)
                              }}
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-blue-100"
                            >
                              <Eye className="w-4 h-4 text-blue-600" />
                            </Button>
                            <Button
                              onClick={(e) => {
                                e.stopPropagation()
                                processWithClaude(doc)
                              }}
                              disabled={isProcessingClaude === doc.id || doc.claudeProcessed}
                              size="sm"
                              variant="ghost"
                              className="h-8 w-8 p-0 hover:bg-purple-100"
                            >
                              {isProcessingClaude === doc.id ? (
                                <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                              ) : (
                                <Brain className="w-4 h-4 text-purple-600" />
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Memory Panel - Compact */}
            <div className="xl:col-span-1">
              {memoryMode === 'enterprise' && (
                <Card className="border border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50 shadow-md">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg text-gray-800">
                      <Database className="w-5 h-5 text-purple-600" />
                      🧠 Memoria Empresarial
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {isLoadingMemory ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                        <span className="ml-2 text-sm text-gray-600">Cargando memoria...</span>
                      </div>
                    ) : memoryStatus ? (
                      <div className="space-y-4">
                        {/* Quick Stats */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-lg border border-purple-100">
                            <div className="text-lg font-bold text-purple-700">
                              {memoryStatus.summary?.total_memories || 0}
                            </div>
                            <div className="text-xs text-gray-600">Patrones</div>
                          </div>
                          <div className="bg-white p-3 rounded-lg border border-blue-100">
                            <div className="text-lg font-bold text-blue-700">
                              {memoryStatus.summary?.total_embeddings || 0}
                            </div>
                            <div className="text-xs text-gray-600">Fragmentos</div>
                          </div>
                        </div>

                        {/* Recent Activity */}
                        {memoryStatus.recent_activity && memoryStatus.recent_activity.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Actividad Reciente</h4>
                            <div className="space-y-2 max-h-32 overflow-y-auto">
                              {memoryStatus.recent_activity.slice(0, 3).map((activity: any, index: number) => (
                                <div key={index} className="bg-white p-2 rounded border border-gray-100">
                                  <div className="text-xs font-medium text-gray-800 truncate">
                                    {activity.original_filename}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {new Date(activity.created_at).toLocaleDateString()}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={() => setShowMemoryConfig(!showMemoryConfig)}
                          size="sm"
                          variant="outline"
                          className="w-full border-purple-200 text-purple-700 hover:bg-purple-50"
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          {showMemoryConfig ? 'Ocultar' : 'Ver'} Detalles
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-6">
                        <AlertCircle className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Sin datos de memoria</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
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

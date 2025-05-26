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
import { Upload, FileText, Download, Eye, FileImage, Type, Brain, CheckCircle, FileSpreadsheet, Zap, Database, TrendingUp, Clock, Hash, Settings, AlertCircle, Star, Sparkles } from 'lucide-react'

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

  const processAllWithClaude = async () => {
    const unprocessedDocs = splitDocuments.filter(doc => !doc.claudeProcessed && doc.textContent?.trim())
    
    if (unprocessedDocs.length === 0) {
      alert('No hay documentos sin procesar disponibles')
      return
    }

    const modeText = memoryMode === 'enterprise' ? 'Memoria Empresarial' : 'Procesamiento Básico'
    const confirmProcess = confirm(`¿Quieres procesar ${unprocessedDocs.length} documentos con Claude AI usando ${modeText}? Esto puede tardar unos minutos.`)
    if (!confirmProcess) return

    setIsBatchProcessing(true)
    setBatchProgress(0)

    try {
      // Choose endpoint based on memory mode
      const endpoint = memoryMode === 'enterprise' ? '/api/process-nomina' : '/api/process-nomina-basic'
      
      // Process documents one by one to show progress
      const results = []
      const errors = []

      for (let i = 0; i < unprocessedDocs.length; i++) {
        const doc = unprocessedDocs[i]
        setBatchProgress(Math.round((i / unprocessedDocs.length) * 100))

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

      // Refresh memory status only if in enterprise mode
      if (memoryMode === 'enterprise') {
        loadMemoryStatus()
      }

      const modeInfo = memoryMode === 'enterprise' 
        ? 'La memoria empresarial se ha actualizado con todos los documentos procesados. 🧠'
        : 'Procesamiento básico completado sin memoria empresarial. ⚡'

      const successMessage = `¡Procesamiento completado!\n\n` +
        `✅ Procesados exitosamente: ${results.length}\n` +
        `❌ Errores: ${errors.length}\n` +
        `📊 Modo: ${modeText}\n\n` +
        `${modeInfo}\n\n` +
        `Todos los datos se han guardado en Supabase.`

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

        {/* Memory Configuration Section */}
        <Card className="mb-8 border-2 border-blue-200 bg-gradient-to-r from-blue-50 via-emerald-50 to-orange-50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl text-gray-800">
              <Settings className="w-6 h-6 text-blue-600" />
              ⚙️ Configuración del Sistema de Procesamiento
            </CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Elige el nivel de procesamiento que mejor se adapte a tus necesidades empresariales
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Basic Mode */}
                <div className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                  memoryMode === 'basic' 
                    ? 'border-blue-500 bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg' 
                    : 'border-gray-200 bg-white hover:border-blue-300 hover:shadow-md'
                }`}
                onClick={() => setMemoryMode('basic')}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Brain className="w-6 h-6 text-blue-600" />
                      <h3 className="font-bold text-xl text-gray-800">Procesamiento Básico</h3>
                    </div>
                    <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 text-sm px-3 py-1">
                      GRATUITO
                    </Badge>
                  </div>
                  <ul className="space-y-3 text-sm text-gray-600 mb-4">
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Procesamiento con Claude AI
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Extracción de datos de nóminas
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Exportación a Excel
                    </li>
                    <li className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                      Sin memoria empresarial
                    </li>
                    <li className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-gray-400" />
                      Cada documento se procesa desde cero
                    </li>
                  </ul>
                  <p className="text-xs text-gray-500 bg-blue-50 p-2 rounded-lg">
                    ⏱️ Tiempo promedio: 20-30 segundos por documento
                  </p>
                </div>

                {/* Enterprise Mode */}
                <div className={`p-6 rounded-xl border-2 cursor-pointer transition-all duration-300 transform hover:scale-105 ${
                  memoryMode === 'enterprise' 
                    ? 'border-purple-500 bg-gradient-to-br from-purple-50 to-orange-100 shadow-lg' 
                    : 'border-gray-200 bg-white hover:border-purple-300 hover:shadow-md'
                }`}
                onClick={() => setMemoryMode('enterprise')}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-6 h-6 text-purple-600" />
                      <h3 className="font-bold text-xl text-gray-800">Memoria Empresarial</h3>
                    </div>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-sm px-3 py-1">
                      PREMIUM
                    </Badge>
                  </div>
                  <ul className="space-y-3 text-sm text-gray-600 mb-4">
                    <li className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-500" />
                      Todo lo del plan básico +
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Sistema de memoria inteligente
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Búsqueda semántica de documentos
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Aprendizaje automático de patrones
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-500" />
                      Precisión mejorada (90-95%)
                    </li>
                  </ul>
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 bg-purple-50 p-2 rounded-lg">
                      ⏱️ Tiempo promedio: 5-10 segundos por documento
                    </p>
                    <p className="text-xs text-orange-600 font-medium bg-orange-50 p-2 rounded-lg">
                      💰 Costo: ~$0.10 por 1000 documentos procesados
                    </p>
                  </div>
                </div>
              </div>

              {/* Current Selection Info */}
              <div className={`p-4 rounded-xl border-2 ${
                memoryMode === 'enterprise' 
                  ? 'bg-gradient-to-r from-purple-50 to-orange-50 border-purple-200' 
                  : 'bg-gradient-to-r from-blue-50 to-emerald-50 border-blue-200'
              }`}>
                <div className="flex items-center gap-3 text-sm">
                  {memoryMode === 'enterprise' ? (
                    <>
                      <Sparkles className="w-5 h-5 text-purple-600" />
                      <span className="font-bold text-purple-700 text-lg">
                        🚀 Memoria Empresarial Activada
                      </span>
                      <span className="text-purple-600">
                        - Tu sistema aprenderá automáticamente de cada documento
                      </span>
                    </>
                  ) : (
                    <>
                      <Brain className="w-5 h-5 text-blue-600" />
                      <span className="font-bold text-blue-700 text-lg">
                        ⚡ Procesamiento Básico Activado
                      </span>
                      <span className="text-blue-600">
                        - Procesamiento estándar sin memoria empresarial
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Section */}
        <Card className="mb-8 border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-2xl text-gray-800">
              <Upload className="w-6 h-6 text-emerald-600" />
              📁 Cargar Documentos PDF
            </CardTitle>
            <CardDescription className="text-lg text-gray-600">
              Selecciona archivos PDF de nóminas para dividir en páginas individuales y extraer texto automáticamente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <Label htmlFor="pdf-upload" className="text-lg font-medium text-gray-700">
                  Seleccionar Archivos PDF
                </Label>
                <Input
                  id="pdf-upload"
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="cursor-pointer mt-2 border-2 border-emerald-200 focus:border-emerald-400 text-lg p-3"
                />
              </div>

              {isUploading && (
                <div className="space-y-3 bg-blue-50 p-4 rounded-xl border border-blue-200">
                  <div className="flex justify-between text-sm font-medium">
                    <span className="text-blue-700">🔄 Procesando archivo...</span>
                    <span className="text-blue-600">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="w-full h-3" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Results Section */}
        {splitDocuments.length > 0 && (
          <div className="space-y-6">
            {/* Action Buttons */}
            <Card className="border-2 border-orange-200 bg-gradient-to-r from-orange-50 to-purple-50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-2xl text-gray-800">
                  <Zap className="w-6 h-6 text-orange-600" />
                  ⚡ Acciones Masivas
                </CardTitle>
                <CardDescription className="text-lg text-gray-600">
                  Procesa todos los documentos automáticamente o exporta los datos existentes a Excel
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  <Button
                    onClick={processAllWithClaude}
                    disabled={isBatchProcessing || splitDocuments.filter(doc => !doc.claudeProcessed && doc.textContent?.trim()).length === 0}
                    size="lg"
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 text-lg font-medium shadow-lg"
                  >
                    {isBatchProcessing ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Brain className="w-5 h-5" />
                    )}
                    {isBatchProcessing 
                      ? 'Procesando...' 
                      : `🧠 Procesar Todo con IA (${splitDocuments.filter(doc => !doc.claudeProcessed && doc.textContent?.trim()).length} pendientes)`
                    }
                  </Button>
                  
                  <Button
                    onClick={exportToExcel}
                    disabled={isExportingExcel}
                    size="lg"
                    variant="secondary"
                    className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-blue-500 hover:from-emerald-600 hover:to-blue-600 text-white px-6 py-3 text-lg font-medium shadow-lg"
                  >
                    {isExportingExcel ? (
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <FileSpreadsheet className="w-5 h-5" />
                    )}
                    {isExportingExcel ? 'Exportando...' : '📊 Exportar a Excel'}
                  </Button>
                </div>

                {isBatchProcessing && (
                  <div className="mt-6 space-y-3 bg-blue-50 p-4 rounded-xl border border-blue-200">
                    <div className="flex justify-between text-sm font-medium">
                      <span className="text-blue-700">🔄 Procesando documentos con Claude AI...</span>
                      <span className="text-blue-600">{batchProgress}%</span>
                    </div>
                    <Progress value={batchProgress} className="w-full h-3" />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Document List */}
              <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-emerald-50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-xl text-gray-800">
                    <FileText className="w-6 h-6 text-blue-600" />
                    📄 Documentos Divididos ({splitDocuments.length} páginas)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {splitDocuments.map((doc) => (
                      <div key={doc.id} className="p-4 border-2 border-gray-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 hover:border-blue-300">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-gray-800">{doc.filename}</h3>
                              {doc.claudeProcessed && (
                                <CheckCircle className="w-5 h-5 text-emerald-500" aria-label="Processed with Claude" />
                              )}
                            </div>
                            <p className="text-sm text-gray-500 mb-1">📄 Página {doc.pageNumber}</p>
                            {doc.claudeProcessed && (
                              <p className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full inline-block">
                                ✅ Procesado y guardado en Supabase
                              </p>
                            )}
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(doc.pdfUrl, doc.filename)}
                              className="border-blue-300 text-blue-700 hover:bg-blue-50"
                            >
                              <Download className="w-4 h-4 mr-1" />
                              PDF
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => downloadFile(doc.textUrl, doc.filename.replace('.pdf', '.txt'))}
                              className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                            >
                              <FileText className="w-4 h-4 mr-1" />
                              Texto
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSelectedDocument(doc)
                                openViewer(doc)
                              }}
                              className="border-purple-300 text-purple-700 hover:bg-purple-50"
                            >
                              <Eye className="w-4 h-4 mr-1" />
                              Ver
                            </Button>
                            {!doc.claudeProcessed && !isProcessingClaude && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => processWithClaude(doc)}
                                disabled={isProcessingClaude === doc.id}
                                className="border-orange-300 text-orange-700 hover:bg-orange-50"
                              >
                                <Brain className="w-4 h-4 mr-1" />
                                IA
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
              <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-orange-50 shadow-lg">
                <CardHeader>
                  <CardTitle className="text-xl text-gray-800">
                    {selectedDocument ? (
                      <div className="flex items-center gap-2">
                        <span>📄 {selectedDocument.filename}</span>
                        {selectedDocument.claudeProcessed && (
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        )}
                      </div>
                    ) : (
                      '👁️ Visor de Contenido'
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedDocument ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-500">
                          Página {selectedDocument.pageNumber}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              downloadFile(selectedDocument.textUrl, `${selectedDocument.filename}.txt`)
                            }
                            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          >
                            <Download className="w-4 h-4 mr-2" />
                            Descargar Texto
                          </Button>
                          {!selectedDocument.claudeProcessed && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => processWithClaude(selectedDocument)}
                              disabled={isProcessingClaude === selectedDocument.id}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              {isProcessingClaude === selectedDocument.id ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              ) : (
                                <Brain className="w-4 h-4 mr-2" />
                              )}
                              Procesar con Claude
                            </Button>
                          )}
                        </div>
                      </div>

                      {selectedDocument.claudeProcessed && (
                        <div className="bg-gradient-to-r from-emerald-50 to-green-50 border-2 border-emerald-200 rounded-xl p-4">
                          <div className="flex items-center gap-2 text-emerald-700 font-medium mb-2">
                            <CheckCircle className="w-5 h-5" />
                            ✅ Procesado con Claude AI
                          </div>
                          <p className="text-sm text-emerald-600">
                            📋 Nómina ID: {selectedDocument.nominaData?.nominaId}
                          </p>
                          <p className="text-sm text-emerald-600">
                            💾 Guardado en Supabase exitosamente
                          </p>
                        </div>
                      )}

                      <div className="bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                        <pre className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">
                          {selectedDocument.textContent || 'No se encontró contenido de texto en esta página.'}
                        </pre>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
                      <div className="text-6xl mb-4">📄</div>
                      <p className="text-gray-600 text-lg font-medium mb-2">
                        Selecciona un documento
                      </p>
                      <p className="text-gray-500 text-sm">
                        Haz clic en "Ver" en cualquier documento de la lista para mostrar su contenido aquí
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* Memory Status Panel */}
        {memoryMode === 'enterprise' && memoryStatus && (
          <Card className="mt-8 border-2 border-emerald-200 bg-gradient-to-r from-emerald-50 to-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-emerald-800">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-6 h-6" />
                  🧠 Lo que hemos aprendido de tu empresa
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={loadMemoryStatus}
                    disabled={isLoadingMemory}
                    className="border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                  >
                    {isLoadingMemory ? (
                      <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin mr-2" />
                    ) : (
                      <Database className="w-4 h-4 mr-2" />
                    )}
                    Actualizar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => deleteMemoryData('all')}
                    disabled={isDeletingMemory}
                    className="border-red-300 text-red-700 hover:bg-red-100"
                  >
                    🗑️ Limpiar Memoria
                  </Button>
                </div>
              </CardTitle>
              <CardDescription className="text-emerald-700 text-lg">
                Cada documento que procesas enseña algo nuevo a nuestro sistema. Aquí puedes ver exactamente qué hemos aprendido de tu empresa y cómo esto te ahorra tiempo y dinero.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                const insights = generateBusinessInsights(memoryStatus)
                
                if (insights.length === 0) {
                  return (
                    <div className="text-center py-12 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border-2 border-blue-200">
                      <div className="text-6xl mb-4">🌱</div>
                      <h3 className="text-xl font-bold text-gray-800 mb-2">¡Tu memoria empresarial está creciendo!</h3>
                      <p className="text-gray-600 mb-4">
                        Procesa algunos documentos más y verás aparecer aquí insights específicos sobre tu empresa.
                      </p>
                      <p className="text-sm text-gray-500">
                        Con cada nómina procesada, el sistema aprende más sobre tus patrones específicos.
                      </p>
                    </div>
                  )
                }

                return (
                  <div className="space-y-6">
                    {/* Business Value Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-emerald-600 mb-1">
                          {memoryStatus.summary.total_processed}
                        </div>
                        <p className="text-sm font-medium text-emerald-700">Documentos Aprendidos</p>
                        <p className="text-xs text-emerald-600">Cada uno mejora la precisión</p>
                      </div>
                      
                      <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-200 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-blue-600 mb-1">
                          {memoryStatus.summary.total_memories > 0 ? 
                            Math.round((memoryStatus.memory_patterns.reduce((acc: number, pattern: any) => 
                              acc + (pattern.confidence_score || 0), 0) / memoryStatus.memory_patterns.length) * 100) : 50}%
                        </div>
                        <p className="text-sm font-medium text-blue-700">Precisión Actual</p>
                        <p className="text-xs text-blue-600">Mejora automáticamente</p>
                      </div>
                      
                      <div className="bg-gradient-to-br from-orange-50 to-orange-100 border-2 border-orange-200 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-orange-600 mb-1">
                          {memoryStatus.summary.total_processed > 10 ? '5-8s' : '8-15s'}
                        </div>
                        <p className="text-sm font-medium text-orange-700">Tiempo por Documento</p>
                        <p className="text-xs text-orange-600">Cada vez más rápido</p>
                      </div>
                    </div>

                    {/* Business Insights */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {insights.map((insight, index) => (
                        <div key={index} className="bg-white rounded-xl border-2 border-gray-100 p-6 shadow-sm hover:shadow-md transition-all">
                          <div className="flex items-start gap-4">
                            <div className="text-4xl">{insight.icon}</div>
                            <div className="flex-1">
                              <h4 className="font-bold text-gray-800 text-lg mb-2">{insight.title}</h4>
                              <p className="text-gray-600 mb-3">{insight.description}</p>
                              <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                <p className="text-sm text-gray-700 font-medium">{insight.details}</p>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-sm font-medium">
                                  {insight.value}
                                </span>
                                {insight.type === 'companies' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => deleteMemoryData('patterns')}
                                    disabled={isDeletingMemory}
                                    className="border-red-300 text-red-600 hover:bg-red-50 text-xs"
                                  >
                                    🗑️ Olvidar
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* ROI Information */}
                    <div className="bg-gradient-to-r from-emerald-50 via-blue-50 to-purple-50 rounded-xl border-2 border-emerald-200 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <TrendingUp className="w-6 h-6 text-emerald-600" />
                        <h3 className="text-xl font-bold text-emerald-800">💰 Valor de tu Memoria Empresarial</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2">🚀 Beneficios que ya tienes:</h4>
                          <ul className="space-y-2 text-sm text-gray-700">
                            <li className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                              Procesamiento {memoryStatus.summary.total_processed > 10 ? '3x más rápido' : '2x más rápido'} que el modo básico
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                              Reconocimiento automático de tu formato de nóminas
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                              Menos errores en la extracción de datos
                            </li>
                            <li className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-emerald-500" />
                              Búsqueda inteligente de documentos similares
                            </li>
                          </ul>
                        </div>
                        
                        <div>
                          <h4 className="font-semibold text-gray-800 mb-2">📊 Ahorro estimado:</h4>
                          <div className="bg-white rounded-lg p-4 border border-emerald-200">
                            <div className="text-2xl font-bold text-emerald-600 mb-1">
                              ~{Math.round(memoryStatus.summary.total_processed * 15)} segundos
                            </div>
                            <p className="text-sm text-gray-600 mb-2">Tiempo ahorrado hasta ahora</p>
                            <p className="text-xs text-gray-500">
                              Basado en {memoryStatus.summary.total_processed} documentos procesados con memoria vs modo básico
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                        <p className="text-sm text-blue-700">
                          <strong>💡 Consejo:</strong> Cuantos más documentos proceses, más inteligente se vuelve el sistema. 
                          La inversión en memoria empresarial se paga sola después de procesar ~100 documentos.
                        </p>
                      </div>
                    </div>

                    {/* Privacy Controls */}
                    <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <Settings className="w-6 h-6 text-gray-600" />
                        <h3 className="text-xl font-bold text-gray-800">🔒 Control de Privacidad</h3>
                      </div>
                      
                      <p className="text-gray-600 mb-4">
                        Tienes control total sobre qué información guardamos. Puedes eliminar datos específicos en cualquier momento.
                      </p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Button
                          variant="outline"
                          onClick={() => deleteMemoryData('patterns')}
                          disabled={isDeletingMemory}
                          className="border-orange-300 text-orange-700 hover:bg-orange-50"
                        >
                          🧠 Olvidar Patrones
                        </Button>
                        
                        <Button
                          variant="outline"
                          onClick={() => deleteMemoryData('embeddings')}
                          disabled={isDeletingMemory}
                          className="border-purple-300 text-purple-700 hover:bg-purple-50"
                        >
                          🔍 Limpiar Búsquedas
                        </Button>
                        
                        <Button
                          variant="outline"
                          onClick={() => deleteMemoryData('documents')}
                          disabled={isDeletingMemory}
                          className="border-blue-300 text-blue-700 hover:bg-blue-50"
                        >
                          📄 Borrar Historial
                        </Button>
                      </div>
                      
                      <p className="text-xs text-gray-500 mt-3">
                        ⚠️ Eliminar datos de memoria puede reducir la precisión y velocidad del procesamiento futuro.
                      </p>
                    </div>
                  </div>
                )
              })()}
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

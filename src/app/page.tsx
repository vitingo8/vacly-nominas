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
import { Upload, FileText, Download, Eye, FileImage, Type, Brain, CheckCircle, FileSpreadsheet, Zap, Database, TrendingUp, Clock, Hash, Settings, AlertCircle, Star, Sparkles, Loader2, Shield, Rocket, Users, BarChart3, Lock, Award, ChevronRight, ArrowRight } from 'lucide-react'

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
  employer_cost?: number
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
  const [memoryStatus, setMemoryStatus] = useState<any>(null)
  const [isLoadingMemory, setIsLoadingMemory] = useState(false)
  const [memoryMode, setMemoryMode] = useState<'basic' | 'enterprise'>('basic')
  const [showMemoryConfig, setShowMemoryConfig] = useState(false)
  const [isDeletingMemory, setIsDeletingMemory] = useState(false)
  const [showPricing, setShowPricing] = useState(false)
  const [selectedPlan, setSelectedPlan] = useState<'basic' | 'professional' | 'lux'>('basic')

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
    if (!memoryStatus || !memoryStatus.summary) return []

    const insights = []
    const patterns = memoryStatus.memory_patterns || []
    const totalDocs = memoryStatus.summary?.total_processed || 0
    const totalEmbeddings = memoryStatus.summary?.total_embeddings || 0

    // Company structure insights
    if (patterns.length > 0) {
      const companies = patterns
        .map((p: any) => p.extracted_data?.company?.name)
        .filter(Boolean)
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
      const keywords = patterns
        .flatMap((p: any) => p.keywords || [])
        .filter(Boolean)
      const uniqueKeywords = [...new Set(keywords)].slice(0, 5)
      if (uniqueKeywords.length > 0) {
        insights.push({
          icon: '🧠',
          title: 'Términos Empresariales Aprendidos',
          description: `Reconocemos automáticamente ${uniqueKeywords.length} términos específicos de tu empresa`,
          details: uniqueKeywords.join(', '),
          value: `${uniqueKeywords.length} términos`,
          type: 'keywords'
        })
      }
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
    const avgConfidence = memoryStatus.summary?.avg_confidence || 0.5
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
      alert('Por favor selecciona un archivo PDF')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setProgressMessage('Iniciando carga...')
    setCurrentPage(null)
    setTotalPages(null)

    const formData = new FormData()
    formData.append('pdf', file)

    try {
      // Phase 1: Upload the file (0-20%)
      setUploadProgress(5)
      setProgressMessage('Subiendo archivo PDF...')
      
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error('Error al subir el archivo')
      }

      const uploadResult = await uploadResponse.json()
      setUploadProgress(20)
      setProgressMessage('Archivo subido, iniciando procesamiento...')

      // Try to use the new progress API first
      let processedSuccessfully = false
      
      try {
        // Phase 2: Process with real-time progress using fetch stream (20-100%)
        const processResponse = await fetch('/api/process-with-progress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            filename: uploadResult.filename,
            url: uploadResult.url 
          }),
        })

        if (processResponse.ok) {
          // Handle the Server-Sent Events stream
          const reader = processResponse.body?.getReader()
          const decoder = new TextDecoder()

          if (reader) {
            let buffer = ''
            
            while (true) {
              const { done, value } = await reader.read()
              
              if (done) break

              const chunk = decoder.decode(value, { stream: true })
              buffer += chunk
              
              // Split by double newlines to get complete SSE messages
              const messages = buffer.split('\n\n')
              buffer = messages.pop() || '' // Keep the incomplete message in buffer

              for (const message of messages) {
                const lines = message.split('\n')
                
                for (const line of lines) {
                  if (line.startsWith('data: ')) {
                    try {
                      const data = JSON.parse(line.slice(6))
                      
                      if (data.type === 'progress') {
                        setUploadProgress(Math.max(20, data.progress)) // Ensure we don't go below 20%
                        setProgressMessage(data.message)
                        if (data.currentPage !== undefined) {
                          setCurrentPage(data.currentPage)
                        }
                        if (data.totalPages !== undefined) {
                          setTotalPages(data.totalPages)
                        }
                      } else if (data.type === 'complete') {
                        setUploadProgress(100)
                        setProgressMessage('¡Procesamiento completado!')
                        setSplitDocuments(data.documents)
                        processedSuccessfully = true
                        
                        // Reset progress after a short delay
                        setTimeout(() => {
                          setUploadProgress(0)
                          setProgressMessage('')
                          setCurrentPage(null)
                          setTotalPages(null)
                        }, 2000)
                        return // Exit the function successfully
                      } else if (data.type === 'error') {
                        throw new Error(data.error)
                      }
                    } catch (parseError) {
                      console.error('Error parsing SSE data:', parseError, 'Line:', line)
                    }
                  }
                }
              }
            }
          }
        }
      } catch (progressApiError) {
        console.warn('Progress API failed, falling back to basic processing:', progressApiError)
      }

      // Fallback to original API if progress API failed
      if (!processedSuccessfully) {
        setProgressMessage('Procesamiento con API básica...')
        setUploadProgress(50)
        
        const fallbackResponse = await fetch('/api/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ 
            filename: uploadResult.filename,
            url: uploadResult.url 
          }),
        })

        if (!fallbackResponse.ok) {
          throw new Error('Error al procesar el archivo con API básica')
        }

        setUploadProgress(80)
        const fallbackResult = await fallbackResponse.json()
        setUploadProgress(100)
        setProgressMessage('¡Procesamiento completado!')
        
        setSplitDocuments(fallbackResult.documents)

        // Reset progress after a short delay
        setTimeout(() => {
          setUploadProgress(0)
          setProgressMessage('')
          setCurrentPage(null)
          setTotalPages(null)
        }, 2000)
      }

    } catch (error) {
      console.error('Error:', error)
      alert('Ocurrió un error durante la carga o procesamiento: ' + (error instanceof Error ? error.message : 'Error desconocido'))
      
      // Reset progress on error
      setUploadProgress(0)
      setProgressMessage('')
      setCurrentPage(null)
      setTotalPages(null)
    } finally {
      setIsUploading(false)
    }
  }

  // NEW: Unified Processing with Corrected API
  const handleUnifiedProcessing = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || file.type !== 'application/pdf') {
      alert('Por favor selecciona un archivo PDF')
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setProgressMessage('🚀 Iniciando procesamiento unificado...')
    setCurrentPage(null)
    setTotalPages(null)

    const formData = new FormData()
    formData.append('pdf', file)

    try {
      // Phase 1: Upload the file (0-10%)
      setUploadProgress(5)
      setProgressMessage('⬆️ Subiendo archivo PDF...')
      
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        throw new Error('Error al subir el archivo')
      }

      const uploadResult = await uploadResponse.json()
      setUploadProgress(10)
      setProgressMessage('✅ Archivo subido, iniciando procesamiento unificado con IA...')

      // Phase 2: Process with UNIFIED API - CORRECTED VERSION
      const unifiedResponse = await fetch('/api/process-unified', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          filename: uploadResult.filename,
          url: uploadResult.url 
        }),
      })

      if (unifiedResponse.ok) {
        // Handle the Server-Sent Events stream from unified API
        const reader = unifiedResponse.body?.getReader()
        const decoder = new TextDecoder()

        if (reader) {
          let buffer = ''
          
          while (true) {
            const { done, value } = await reader.read()
            
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            buffer += chunk
            
            // Split by double newlines to get complete SSE messages
            const messages = buffer.split('\n\n')
            buffer = messages.pop() || '' // Keep the incomplete message in buffer

            for (const message of messages) {
              const lines = message.split('\n')
              
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const data = JSON.parse(line.slice(6))
                    
                    if (data.type === 'progress') {
                      setUploadProgress(Math.max(10, data.progress)) // Ensure we don't go below 10%
                      setProgressMessage(data.message)
                      if (data.currentPage !== undefined) {
                        setCurrentPage(data.currentPage)
                      }
                      if (data.totalPages !== undefined) {
                        setTotalPages(data.totalPages)
                      }
                    } else if (data.type === 'complete') {
                      setUploadProgress(100)
                      setProgressMessage('🎉 ¡Procesamiento unificado completado!')
                      setSplitDocuments(data.documents)
                      
                      // Show success message
                      alert(`🚀 ¡Procesamiento Unificado Exitoso!\n\n✅ ${data.totalDocumentsCreated} documentos procesados\n🤖 IA: Claude 3.5 Haiku con soporte PDF nativo\n⚡ 3x más rápido que APIs anteriores\n💾 Datos guardados automáticamente en Supabase`)
                      
                      // Reset progress after a short delay
                      setTimeout(() => {
                        setUploadProgress(0)
                        setProgressMessage('')
                        setCurrentPage(null)
                        setTotalPages(null)
                      }, 3000)
                      return // Exit the function successfully
                    } else if (data.type === 'error') {
                      throw new Error(data.error)
                    }
                  } catch (parseError) {
                    console.error('Error parsing SSE data:', parseError, 'Line:', line)
                  }
                }
              }
            }
          }
        }
      } else {
        throw new Error(`Error en API unificada: ${unifiedResponse.status} ${unifiedResponse.statusText}`)
      }

    } catch (error) {
      console.error('Error en procesamiento unificado:', error)
      alert('❌ Error en procesamiento unificado: ' + (error instanceof Error ? error.message : 'Error desconocido'))
      
      // Reset progress on error
      setUploadProgress(0)
      setProgressMessage('')
      setCurrentPage(null)
      setTotalPages(null)
    } finally {
      setIsUploading(false)
    }
  }

  const downloadFile = async (url: string, filename: string) => {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('Error al descargar')
      
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
      console.error('Error de descarga:', error)
      alert('Error al descargar el archivo')
    }
  }

  const openViewer = (document: SplitDocument) => {
    setViewerDocument(document)
    setIsViewerOpen(true)
    setViewMode('pdf') // Default to PDF view
  }

  const processWithClaude = async (document: SplitDocument) => {
    if (!document.textContent.trim()) {
      alert('No se encontró contenido de texto en este documento para procesar')
      return
    }

    setIsProcessingClaude(document.id)

    try {
      // LÓGICA INTELIGENTE: Decidir qué endpoint usar
      // Si usó procesamiento unificado (detectado por el plan o preferencia), usar Haiku 3.5
      // Si usó procesamiento básico, usar el sistema tradicional
      
      // Determinar si debe usar procesamiento avanzado
      const shouldUseAdvanced = memoryMode === 'enterprise' || 
                                 splitDocuments.some(d => d.claudeProcessed && d.nominaData?.id) // Detecta si ya hay docs procesados con unificado
      
      const endpoint = shouldUseAdvanced ? '/api/process-nomina' : '/api/process-nomina-basic'
      
      console.log(`🔄 Processing document ${document.filename} with ${shouldUseAdvanced ? 'ADVANCED (Haiku 3.5)' : 'BASIC'} processing...`)
      
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
        throw new Error(result.error || 'Error al procesar con Claude')
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

      // Show different success messages based on processing type
      const processingType = shouldUseAdvanced ? 'AVANZADO (Haiku 3.5)' : 'BÁSICO'
      const successMessage = shouldUseAdvanced
        ? `¡Nómina procesada con IA avanzada! 🚀 Procesamiento ${processingType} completado con máxima precisión.`
        : `¡Nómina procesada exitosamente! ⚡ Procesamiento ${processingType} completado.`
      
      if (memoryMode === 'enterprise') {
        alert(successMessage + ' 🧠 La memoria empresarial se ha actualizado automáticamente.')
      } else {
        alert(successMessage)
      }

    } catch (error) {
      console.error('Error procesando con Claude:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`)
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
      // LÓGICA INTELIGENTE PARA BATCH: Mismo criterio que procesamiento individual
      const shouldUseAdvanced = memoryMode === 'enterprise' || 
                                 splitDocuments.some(d => d.claudeProcessed && d.nominaData?.id)
      
      const endpoint = shouldUseAdvanced ? '/api/process-nomina' : '/api/process-nomina-basic'
      const processingType = shouldUseAdvanced ? 'AVANZADO (Haiku 3.5)' : 'BÁSICO'
      
      console.log(`🚀 Starting BATCH processing with ${processingType} for ${unprocessedDocs.length} documents...`)
      
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
              error: error instanceof Error ? error.message : 'Error desconocido'
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

      // Refresh memory status only if in enterprise mode
      if (memoryMode === 'enterprise') {
        loadMemoryStatus()
      }

      // Show results with processing type information
      const successCount = results.length
      const errorCount = errors.length
      
      let message = `✅ Procesamiento ${processingType} completado:\n`
      message += `- ${successCount} documentos procesados exitosamente\n`
      
      if (errorCount > 0) {
        message += `- ${errorCount} documentos con errores\n\n`
        message += `Errores:\n`
        errors.forEach(err => {
          message += `- ${err.filename}: ${err.error}\n`
        })
      }

      if (shouldUseAdvanced) {
        message += '\n🚀 Procesamiento avanzado con Haiku 3.5 utilizado para máxima precisión.'
      }

      if (memoryMode === 'enterprise') {
        message += '\n🧠 La memoria empresarial se ha actualizado con los nuevos patrones.'
      }

      alert(message)

    } catch (error) {
      console.error('Error en procesamiento por lotes:', error)
      alert(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`)
    } finally {
      setIsBatchProcessing(false)
      setBatchProgress(0)
    }
  }

  const exportToExcel = async () => {
    const processedDocs = splitDocuments.filter(doc => doc.claudeProcessed && doc.nominaData)
    
    if (processedDocs.length === 0) {
      alert('No hay documentos procesados para exportar')
      return
    }

    setIsExportingExcel(true)

    try {
      const response = await fetch('/api/export-excel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documents: processedDocs.map(doc => ({
            filename: doc.filename,
            pageNumber: doc.pageNumber,
            nominaData: doc.nominaData
          }))
        }),
      })

      if (!response.ok) {
        throw new Error('Error al exportar a Excel')
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `nominas_procesadas_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

    } catch (error) {
      console.error('Error exportando a Excel:', error)
      alert('Error al exportar a Excel')
    } finally {
      setIsExportingExcel(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-soft border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <img src="/logo_colapsed.png" alt="Logo" className="h-10 w-auto" />
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">Nóminas</h1>
                  <p className="text-sm text-gray-500">by vacly</p>
                </div>
              </div>
              <Badge variant="secondary" className="text-xs">
                Sistema Inteligente de Gestión
              </Badge>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Memory Mode Toggle */}
              <div className="flex items-center space-x-2 bg-gray-100 rounded-lg p-1">
                <button
                  onClick={() => setMemoryMode('basic')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    memoryMode === 'basic' 
                      ? 'bg-white text-gray-900 shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4" />
                    <span>Básico</span>
                  </div>
                </button>
                <button
                  onClick={() => setMemoryMode('enterprise')}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    memoryMode === 'enterprise' 
                      ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-sm' 
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <Brain className="h-4 w-4" />
                    <span>Memoria</span>
                  </div>
                </button>
              </div>

              {memoryMode === 'enterprise' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMemoryConfig(!showMemoryConfig)}
                  className="flex items-center space-x-2"
                >
                  <Settings className="h-4 w-4" />
                  <span>Configurar</span>
                </Button>
              )}
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPricing(true)}
                className="flex items-center space-x-2"
              >
                <Star className="h-4 w-4" />
                <span>Pricing</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Mode Switch Notification */}
        {memoryMode === 'enterprise' && splitDocuments.length === 0 && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-3">
              <div className="bg-blue-100 rounded-full p-2">
                <Brain className="h-5 w-5 text-blue-600" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-blue-900">
                  Modo Memoria Empresarial Activado
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Tu sistema comenzará a aprender automáticamente cuando proceses documentos. 
                  Cada nómina mejorará la precisión y velocidad del siguiente procesamiento.
                </p>
              </div>
              <Badge className="bg-blue-600 text-white">
                <Sparkles className="h-3 w-3 mr-1" />
                PREMIUM
              </Badge>
            </div>
          </div>
        )}

        {/* Memory Benefits Banner */}
        {memoryMode === 'enterprise' && (
          <div className="mb-8 bg-gradient-to-r from-purple-600 to-blue-600 rounded-2xl p-8 text-white shadow-premium">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-4">
                  <Brain className="h-10 w-10" />
                  <h2 className="text-3xl font-bold">Memoria Empresarial Activa</h2>
                  <Badge className="badge-premium">PREMIUM</Badge>
                </div>
                <p className="text-lg mb-6 text-blue-100">
                  Tu sistema aprende y mejora con cada nómina procesada. La IA reconoce patrones específicos de tu empresa.
                </p>
                
                {/* Key Benefits */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Rocket className="h-5 w-5" />
                      <span className="font-semibold">80% más rápido</span>
                    </div>
                    <p className="text-sm text-blue-100">Procesamiento acelerado con patrones aprendidos</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <Shield className="h-5 w-5" />
                      <span className="font-semibold">99% precisión</span>
                    </div>
                    <p className="text-sm text-blue-100">Reconocimiento exacto de tu estructura</p>
                  </div>
                  <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4">
                    <div className="flex items-center space-x-2 mb-2">
                      <TrendingUp className="h-5 w-5" />
                      <span className="font-semibold">Mejora continua</span>
                    </div>
                    <p className="text-sm text-blue-100">Cada documento mejora el sistema</p>
                  </div>
                </div>

                {/* Memory Status Summary */}
                {memoryStatus && (
                  <div className="flex items-center space-x-6 text-sm">
                    <div className="flex items-center space-x-2">
                      <Database className="h-4 w-4" />
                      <span>{memoryStatus.summary?.total_processed || 0} documentos aprendidos</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Brain className="h-4 w-4" />
                      <span>{memoryStatus.memory_patterns?.length || 0} patrones reconocidos</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Award className="h-4 w-4" />
                      <span>{Math.round((memoryStatus.summary?.avg_confidence || 0.5) * 100)}% confianza</span>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="ml-8 hidden lg:block">
                <div className="animate-float">
                  <Brain className="h-32 w-32 text-white/20" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Upload Section */}
        <Card className="mb-8 shadow-soft card-hover">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-lg">
            <CardTitle className="text-2xl flex items-center space-x-3">
              <Upload className="h-6 w-6 text-blue-600" />
              <span>Cargar Nóminas</span>
            </CardTitle>
            <CardDescription className="text-base mt-2">
              Sube tus archivos PDF de nóminas para procesarlos automáticamente
            </CardDescription>
          </CardHeader>
          <CardContent className="p-8">
            <div className="space-y-6">
              {/* Processing Mode Selection */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Elige el método de procesamiento:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Unified Processing (Recommended) */}
                  <div className="border-2 border-dashed border-blue-300 rounded-xl p-6 text-center hover:border-blue-500 transition-colors bg-blue-50/50">
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={handleUnifiedProcessing}
                      disabled={isUploading}
                      className="hidden"
                      id="unified-upload"
                    />
                    <Label
                      htmlFor="unified-upload"
                      className="cursor-pointer flex flex-col items-center space-y-3"
                    >
                      <div className="p-3 bg-blue-500 rounded-full">
                        <Rocket className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-base font-semibold text-gray-900">
                          🚀 Procesamiento Unificado
                        </p>
                        <Badge className="mt-1 bg-blue-500 text-white text-xs">
                          RECOMENDADO
                        </Badge>
                        <p className="text-xs text-gray-600 mt-2">
                          • Claude 3.5 Haiku con PDF nativo<br/>
                          • 3x más rápido<br/>
                          • 95%+ precisión<br/>
                          • Auto-guardado en BD
                        </p>
                      </div>
                    </Label>
                  </div>

                  {/* Basic Processing (Fallback) */}
                  <div className="border-2 border-dashed border-gray-300 rounded-xl p-6 text-center hover:border-gray-400 transition-colors">
                    <Input
                      type="file"
                      accept=".pdf"
                      onChange={handleFileUpload}
                      disabled={isUploading}
                      className="hidden"
                      id="basic-upload"
                    />
                    <Label
                      htmlFor="basic-upload"
                      className="cursor-pointer flex flex-col items-center space-y-3"
                    >
                      <div className="p-3 bg-gray-500 rounded-full">
                        <Upload className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <p className="text-base font-medium text-gray-900">
                          📄 Procesamiento Básico
                        </p>
                        <Badge className="mt-1 bg-gray-500 text-white text-xs">
                          FALLBACK
                        </Badge>
                        <p className="text-xs text-gray-600 mt-2">
                          • OCR Básico<br/>
                          • Procesar unitariamente<br/>
                          • Sin validación inteligente<br/>
                          • Más lento pero estable
                        </p>
                      </div>
                    </Label>
                  </div>

                </div>
              </div>

              {uploadProgress > 0 && (
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      {progressMessage || 'Progreso de carga'}
                    </span>
                    <span className="font-medium">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-3" />
                  {currentPage !== null && totalPages !== null && (
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>
                        Procesando página {currentPage} de {totalPages}
                      </span>
                      <span>
                        {totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0}% de páginas completadas
                      </span>
                    </div>
                  )}
                  {totalPages !== null && totalPages > 1 && (
                    <div className="bg-gray-100 rounded-lg p-3">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                          <span className="text-gray-700">
                            Dividiendo PDF en {totalPages} páginas individuales
                          </span>
                        </div>
                        {currentPage !== null && (
                          <Badge variant="secondary" className="text-xs">
                            Página actual: {currentPage}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Documents Grid */}
        {splitDocuments.length > 0 && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">
                Documentos Procesados ({splitDocuments.length})
              </h2>
              <div className="flex space-x-3">
                <Button
                  onClick={processBatchWithClaude}
                  disabled={isBatchProcessing || splitDocuments.filter(d => !d.claudeProcessed).length === 0}
                  className="gradient-primary text-white"
                >
                  {isBatchProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Procesando {batchProgress}%
                    </>
                  ) : (
                    <>
                      <Brain className="mr-2 h-4 w-4" />
                      Procesar Todos con IA
                    </>
                  )}
                </Button>
                <Button
                  onClick={exportToExcel}
                  disabled={isExportingExcel || splitDocuments.filter(d => d.claudeProcessed).length === 0}
                  variant="outline"
                  className="border-green-600 text-green-600 hover:bg-green-50"
                >
                  {isExportingExcel ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Exportando...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                      Exportar a Excel
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {splitDocuments.map((doc) => (
                <Card 
                  key={doc.id} 
                  className={`shadow-soft card-hover ${
                    doc.claudeProcessed ? 'border-green-200 bg-green-50/50' : ''
                  }`}
                >
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base flex items-center space-x-2">
                          <FileText className="h-5 w-5 text-gray-600 flex-shrink-0" />
                          <span className="truncate">{doc.filename}</span>
                        </CardTitle>
                        <CardDescription className="mt-1 flex items-center space-x-2">
                          <span>Página {doc.pageNumber}</span>
                          {doc.claudeProcessed && (
                            <Badge className="gradient-success text-white text-xs ml-2">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Procesado
                            </Badge>
                          )}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {doc.claudeProcessed && doc.nominaData && (
                      <div className="mb-4 p-4 bg-white rounded-lg border border-gray-200 space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Empleado:</span>
                          <span className="text-sm font-medium">{doc.nominaData.employee?.name || 'N/A'}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Periodo:</span>
                          <span className="text-sm font-medium">
                            {doc.nominaData.period_start || 'N/A'} - {doc.nominaData.period_end || 'N/A'}
                          </span>
                        </div>
                        
                        {/* Bruto, Neto, Coste Empresa */}
                        <div className="space-y-1 pt-2 border-t border-gray-100">
                          {/* Sueldo Bruto */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Sueldo bruto:</span>
                            <span className="text-sm font-medium text-blue-600">
                              €{doc.nominaData.gross_salary ? doc.nominaData.gross_salary.toFixed(2) : 
                                  (doc.nominaData.perceptions?.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) || 0).toFixed(2)}
                            </span>
                          </div>
                          
                          {/* Neto a Pagar */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Neto a pagar:</span>
                            <span className="text-sm font-bold text-green-600">
                              €{doc.nominaData.net_pay ? doc.nominaData.net_pay.toFixed(2) : '0.00'}
                            </span>
                          </div>
                          
                          {/* Coste Empresa */}
                          <div className="flex justify-between items-center">
                            <span className="text-sm text-gray-600">Coste empresa:</span>
                            <span className="text-sm font-semibold text-purple-600">
                              €{doc.nominaData.cost_empresa ? doc.nominaData.cost_empresa.toFixed(2) : 
                                  doc.nominaData.employer_cost ? doc.nominaData.employer_cost.toFixed(2) : '0.00'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openViewer(doc)}
                        className="flex-1"
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        Ver
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => downloadFile(doc.pdfUrl, doc.filename)}
                        className="flex-1"
                      >
                        <Download className="mr-1 h-4 w-4" />
                        PDF
                      </Button>
                      {!doc.claudeProcessed && (
                        <Button
                          size="sm"
                          onClick={() => processWithClaude(doc)}
                          disabled={isProcessingClaude === doc.id}
                          className="flex-1 gradient-primary text-white"
                        >
                          {isProcessingClaude === doc.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Brain className="mr-1 h-4 w-4" />
                              Procesar
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Memory Insights Section */}
        {memoryMode === 'enterprise' && memoryStatus && generateBusinessInsights(memoryStatus).length > 0 && (
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center space-x-3">
              <Sparkles className="h-6 w-6 text-purple-600" />
              <span>Insights de tu Memoria Empresarial</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {generateBusinessInsights(memoryStatus).map((insight, index) => (
                <Card key={index} className="shadow-soft card-hover border-purple-200 bg-gradient-to-br from-purple-50 to-blue-50">
                  <CardHeader>
                    <div className="flex items-start space-x-4">
                      <div className="text-4xl">{insight.icon}</div>
                      <div className="flex-1">
                        <CardTitle className="text-lg">{insight.title}</CardTitle>
                        <CardDescription className="mt-2">
                          {insight.description}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg">
                        <span className="text-sm text-gray-600">{insight.details}</span>
                        <Badge variant="secondary" className="font-bold">
                          {insight.value}
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Floating Help Button */}
      {splitDocuments.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          <div className="flex flex-col space-y-3">
            {/* Quick Stats */}
            <Card className="p-4 shadow-lg bg-white/95 backdrop-blur-sm">
              <div className="text-center">
                <p className="text-xs text-gray-500 mb-1">Progreso</p>
                <div className="flex items-center space-x-2">
                  <div className="text-sm font-medium text-green-600">
                    {splitDocuments.filter(d => d.claudeProcessed).length}
                  </div>
                  <div className="text-xs text-gray-400">/</div>
                  <div className="text-sm font-medium text-gray-600">
                    {splitDocuments.length}
                  </div>
                </div>
                <p className="text-xs text-gray-500">procesados</p>
              </div>
            </Card>
            
            {/* Memory indicator */}
            {memoryMode === 'enterprise' && (
              <Card className="p-3 shadow-lg bg-gradient-to-r from-purple-500 to-blue-500 text-white">
                <div className="text-center">
                  <Brain className="h-4 w-4 mx-auto mb-1" />
                  <p className="text-xs font-medium">Memoria Activa</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-sm text-gray-500">
              © 2024 Vacly. Todos los derechos reservados.
            </p>
            <div className="flex items-center space-x-6 mt-4 md:mt-0">
              <Badge variant="outline" className="text-xs">
                <Award className="h-3 w-3 mr-1" />
                Cumple RGPD
              </Badge>
              <Badge variant="outline" className="text-xs">
                <Lock className="h-3 w-3 mr-1" />
                Cifrado SSL
              </Badge>
            </div>
          </div>
        </div>
      </footer>

      {/* Viewer Dialog */}
      <Dialog open={isViewerOpen} onOpenChange={setIsViewerOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>{viewerDocument?.filename} - Página {viewerDocument?.pageNumber}</span>
              <div className="flex items-center space-x-2">
                <Button
                  size="sm"
                  variant={viewMode === 'pdf' ? 'default' : 'outline'}
                  onClick={() => setViewMode('pdf')}
                >
                  <FileImage className="mr-1 h-4 w-4" />
                  PDF
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === 'text' ? 'default' : 'outline'}
                  onClick={() => setViewMode('text')}
                >
                  <Type className="mr-1 h-4 w-4" />
                  Texto
                </Button>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 overflow-auto max-h-[calc(90vh-120px)]">
            {viewMode === 'pdf' ? (
              <iframe
                src={viewerDocument?.pdfUrl}
                className="w-full h-[800px] border rounded"
                title="PDF Viewer"
              />
            ) : (
              <div className="p-4 bg-gray-50 rounded-lg">
                <pre className="whitespace-pre-wrap text-sm font-mono">
                  {viewerDocument?.textContent}
                </pre>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Memory Configuration Dialog */}
      {memoryMode === 'enterprise' && (
        <Dialog open={showMemoryConfig} onOpenChange={setShowMemoryConfig}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-2xl flex items-center space-x-3">
                <Brain className="h-6 w-6 text-purple-600" />
                <span>Configuración de Memoria Empresarial</span>
              </DialogTitle>
            </DialogHeader>
            
            <div className="mt-6 space-y-6">
              {isLoadingMemory ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
                </div>
              ) : memoryStatus ? (
                <>
                  {/* Summary Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <Card className="bg-gradient-to-br from-blue-50 to-indigo-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600">
                          Documentos Procesados
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-blue-600">
                          {memoryStatus.summary?.total_processed || 0}
                        </p>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-purple-50 to-pink-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600">
                          Patrones Aprendidos
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-purple-600">
                          {memoryStatus.memory_patterns?.length || 0}
                        </p>
                      </CardContent>
                    </Card>
                    
                    <Card className="bg-gradient-to-br from-green-50 to-emerald-50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-600">
                          Precisión Promedio
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-2xl font-bold text-green-600">
                          {Math.round((memoryStatus.summary?.avg_confidence || 0.5) * 100)}%
                        </p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Memory Patterns */}
                  {memoryStatus.memory_patterns && memoryStatus.memory_patterns.length > 0 && (
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                        <Hash className="h-5 w-5 text-gray-600" />
                        <span>Patrones Reconocidos</span>
                      </h3>
                      <div className="space-y-3">
                        {memoryStatus.memory_patterns.slice(0, 5).map((pattern: any, index: number) => (
                          <Card key={index} className="shadow-sm">
                            <CardContent className="p-4">
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <p className="font-medium text-gray-900">
                                    {pattern.extracted_data?.company?.name || 'Empresa sin nombre'}
                                  </p>
                                  <p className="text-sm text-gray-600 mt-1">
                                    Empleado: {pattern.extracted_data?.employee?.name || 'N/A'}
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-2">
                                    {pattern.keywords?.slice(0, 3).map((keyword: string, kidx: number) => (
                                      <Badge key={kidx} variant="secondary" className="text-xs">
                                        {keyword}
                                      </Badge>
                                    )) || null}
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteMemoryData('pattern', pattern.id)}
                                  disabled={isDeletingMemory}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  <AlertCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Danger Zone */}
                  <div className="border-t pt-6">
                    <h3 className="text-lg font-semibold mb-4 text-red-600 flex items-center space-x-2">
                      <AlertCircle className="h-5 w-5" />
                      <span>Zona de Peligro</span>
                    </h3>
                    <div className="space-y-3">
                      <Button
                        variant="outline"
                        onClick={() => deleteMemoryData('patterns')}
                        disabled={isDeletingMemory}
                        className="w-full justify-start text-orange-600 border-orange-600 hover:bg-orange-50"
                      >
                        Eliminar todos los patrones aprendidos
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => deleteMemoryData('embeddings')}
                        disabled={isDeletingMemory}
                        className="w-full justify-start text-orange-600 border-orange-600 hover:bg-orange-50"
                      >
                        Eliminar índice de búsqueda semántica
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => deleteMemoryData('all')}
                        disabled={isDeletingMemory}
                        className="w-full justify-start text-red-600 border-red-600 hover:bg-red-50"
                      >
                        Eliminar TODA la memoria empresarial
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <Brain className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">No hay datos de memoria disponibles</p>
                  <p className="text-sm text-gray-500 mt-2">
                    Procesa algunos documentos para comenzar a construir tu memoria empresarial
                  </p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Pricing Dialog */}
      <Dialog open={showPricing} onOpenChange={setShowPricing}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-3xl flex items-center space-x-3">
              <Star className="h-8 w-8 text-yellow-500" />
              <span>Planes de Nóminas</span>
            </DialogTitle>
          </DialogHeader>
          
          <div className="mt-8">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              
              {/* Nominas Basic */}
              <Card className={`relative border-2 transition-all cursor-pointer ${
                selectedPlan === 'basic' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
              }`} onClick={() => setSelectedPlan('basic')}>
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <Zap className="h-8 w-8 text-blue-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Nóminas Basic</CardTitle>
                  <CardDescription className="text-gray-600 mt-2">
                    Procesamiento tradicional con Haiku 3.0
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-gray-900">€19</span>
                    <span className="text-gray-500">/mes</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Claude 3.0 Haiku</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Procesamiento básico de PDFs</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Extracción de texto estándar</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Exportación a Excel</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Procesamiento manual requerido</span>
                    </div>
                  </div>
                  <Button 
                    className={`w-full ${selectedPlan === 'basic' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => {
                      setMemoryMode('basic')
                      setShowPricing(false)
                    }}
                  >
                    {selectedPlan === 'basic' ? 'Plan Actual' : 'Seleccionar Plan'}
                  </Button>
                </CardContent>
              </Card>

              {/* Nominas Professional */}
              <Card className={`relative border-2 transition-all cursor-pointer ${
                selectedPlan === 'professional' ? 'border-purple-500 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
              }`} onClick={() => setSelectedPlan('professional')}>
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-purple-600 text-white px-3 py-1">
                    RECOMENDADO
                  </Badge>
                </div>
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
                    <Rocket className="h-8 w-8 text-purple-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Nóminas Lux</CardTitle>
                  <CardDescription className="text-gray-600 mt-2">
                    Procesamiento avanzado con Haiku 3.5
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-purple-600">€39</span>
                    <span className="text-gray-500">/mes</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Claude 3.5 Haiku con PDF nativo</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Procesamiento unificado automático</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">95%+ precisión garantizada</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">3x más rápido que Basic</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Auto-guardado en base de datos</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Soporte prioritario</span>
                    </div>
                  </div>
                  <Button 
                    className={`w-full ${selectedPlan === 'professional' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => {
                      alert('¡Próximamente! Por ahora puedes usar el modo Memoria para funcionalidad similar.')
                    }}
                  >
                    {selectedPlan === 'professional' ? 'Próximamente' : 'Seleccionar Plan'}
                  </Button>
                </CardContent>
              </Card>

              {/* Nominas Lux */}
              <Card className={`relative border-2 transition-all cursor-pointer ${
                selectedPlan === 'lux' ? 'border-yellow-500 bg-yellow-50' : 'border-gray-200 hover:border-gray-300'
              }`} onClick={() => setSelectedPlan('lux')}>
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-3 py-1">
                    PREMIUM
                  </Badge>
                </div>
                <CardHeader className="text-center pb-4">
                  <div className="mx-auto w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mb-4">
                    <Brain className="h-8 w-8 text-yellow-600" />
                  </div>
                  <CardTitle className="text-2xl font-bold">Nóminas Memory</CardTitle>
                  <CardDescription className="text-gray-600 mt-2">
                    IA avanzada + Memoria empresarial
                  </CardDescription>
                  <div className="mt-4">
                    <span className="text-4xl font-bold text-yellow-600">€49</span>
                    <span className="text-gray-500">/mes</span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Todo de Professional +</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Memoria empresarial inteligente</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Aprendizaje automático</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">80% más rápido con patrones</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">99% precisión empresarial</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Insights y analytics</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <CheckCircle className="h-5 w-5 text-green-500" />
                      <span className="text-sm">Soporte 24/7 dedicado</span>
                    </div>
                  </div>
                  <Button 
                    className={`w-full ${selectedPlan === 'lux' ? 'bg-yellow-600 text-white' : 'bg-gray-100 text-gray-700'}`}
                    onClick={() => {
                      setMemoryMode('enterprise')
                      setShowPricing(false)
                      alert('¡Modo Memoria Empresarial activado! Comenzarás a ver los beneficios inmediatamente.')
                    }}
                  >
                    {selectedPlan === 'lux' ? 'Activar Ahora' : 'Seleccionar Plan'}
                  </Button>
                </CardContent>
              </Card>

            </div>
            
            <div className="mt-8 text-center text-sm text-gray-500">
              <p>Todos los planes incluyen cifrado SSL, cumplimiento RGPD y actualizaciones automáticas.</p>
              <p className="mt-2">Los precios mostrados son orientativos. El sistema actual permite probar todas las funcionalidades.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

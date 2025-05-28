import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Importar dinámicamente el cliente MCP Supabase
    const { createSupabaseClient } = await import('@/lib/supabase-mcp')
    const supabase = createSupabaseClient()

    // 1. Estadísticas generales de nóminas procesadas
    const { data: generalStats } = await supabase
      .from('nominas')
      .select('*')
      
    if (!generalStats) {
      return NextResponse.json({
        success: false,
        error: 'No se pudieron obtener las estadísticas generales'
      }, { status: 500 })
    }

    // Procesar estadísticas generales
    const totalNominas = generalStats.length
    const empresasUnicas = [...new Set(generalStats
      .map(n => n.company?.name)
      .filter(Boolean)
    )]
    const empleadosUnicos = [...new Set(generalStats
      .map(n => n.employee?.name)
      .filter(Boolean)
    )]

    const promedioNeto = generalStats
      .filter(n => n.net_pay)
      .reduce((sum, n) => sum + n.net_pay, 0) / generalStats.filter(n => n.net_pay).length

    const promedioCosteEmpresa = generalStats
      .filter(n => n.cost_empresa)
      .reduce((sum, n) => sum + n.cost_empresa, 0) / generalStats.filter(n => n.cost_empresa).length

    const totalNetoProcessado = generalStats
      .filter(n => n.net_pay)
      .reduce((sum, n) => sum + n.net_pay, 0)

    const totalCosteEmpresaProcessado = generalStats
      .filter(n => n.cost_empresa)
      .reduce((sum, n) => sum + n.cost_empresa, 0)

    // 2. Estadísticas por empresa
    const empresaStats = empresasUnicas.map(empresa => {
      const nominasEmpresa = generalStats.filter(n => n.company?.name === empresa)
      const empleadosEmpresa = [...new Set(nominasEmpresa
        .map(n => n.employee?.name)
        .filter(Boolean)
      )]
      
      return {
        empresa,
        nominas_procesadas: nominasEmpresa.length,
        empleados: empleadosEmpresa,
        promedio_neto: nominasEmpresa
          .filter(n => n.net_pay)
          .reduce((sum, n) => sum + n.net_pay, 0) / nominasEmpresa.filter(n => n.net_pay).length,
        promedio_coste: nominasEmpresa
          .filter(n => n.cost_empresa)
          .reduce((sum, n) => sum + n.cost_empresa, 0) / nominasEmpresa.filter(n => n.cost_empresa).length,
        periodos: {
          inicio: Math.min(...nominasEmpresa.map(n => new Date(n.period_start || n.created_at).getTime())),
          fin: Math.max(...nominasEmpresa.map(n => new Date(n.period_end || n.created_at).getTime()))
        }
      }
    })

    // 3. Patrones de percepciones
    const percepciones = generalStats
      .flatMap(n => n.perceptions || [])
      .filter(p => p.concept && p.concept.trim() !== '')
    
    const percepcionesStats = percepciones.reduce((acc, p) => {
      const concepto = p.concept
      if (!acc[concepto]) {
        acc[concepto] = {
          frecuencia: 0,
          importes: []
        }
      }
      acc[concepto].frecuencia++
      if (p.amount) {
        acc[concepto].importes.push(parseFloat(p.amount))
      }
      return acc
    }, {} as Record<string, { frecuencia: number; importes: number[] }>)

    const topPercepciones = Object.entries(percepcionesStats)
      .map(([concepto, stats]) => ({
        concepto,
        frecuencia: stats.frecuencia,
        promedio_importe: stats.importes.length > 0 
          ? stats.importes.reduce((sum, imp) => sum + imp, 0) / stats.importes.length 
          : 0
      }))
      .sort((a, b) => b.frecuencia - a.frecuencia)
      .slice(0, 10)

    // 4. Patrones de deducciones
    const deducciones = generalStats
      .flatMap(n => n.deductions || [])
      .filter(d => d.concept && d.concept.trim() !== '')
    
    const deduccionesStats = deducciones.reduce((acc, d) => {
      const concepto = d.concept
      if (!acc[concepto]) {
        acc[concepto] = {
          frecuencia: 0,
          importes: []
        }
      }
      acc[concepto].frecuencia++
      if (d.amount) {
        acc[concepto].importes.push(parseFloat(d.amount))
      }
      return acc
    }, {} as Record<string, { frecuencia: number; importes: number[] }>)

    const topDeducciones = Object.entries(deduccionesStats)
      .map(([concepto, stats]) => ({
        concepto,
        frecuencia: stats.frecuencia,
        promedio_importe: stats.importes.length > 0 
          ? stats.importes.reduce((sum, imp) => sum + imp, 0) / stats.importes.length 
          : 0
      }))
      .sort((a, b) => b.frecuencia - a.frecuencia)
      .slice(0, 10)

    // 5. Métricas de tiempo y eficiencia
    const fechas = generalStats
      .map(n => new Date(n.created_at))
      .sort((a, b) => a.getTime() - b.getTime())

    const primerProcesamiento = fechas[0]
    const ultimoProcesamiento = fechas[fechas.length - 1]
    const diasEntrePrimerYUltimo = (ultimoProcesamiento.getTime() - primerProcesamiento.getTime()) / (1000 * 60 * 60 * 24)
    const velocidadProcesamiento = totalNominas / Math.max(diasEntrePrimerYUltimo, 1) // nóminas por día

    // 6. Simular métricas de confianza basadas en la consistencia de datos
    const nominasCompletas = generalStats.filter(n => 
      n.employee?.name && 
      n.company?.name && 
      n.net_pay && 
      n.perceptions?.length > 0 && 
      n.deductions?.length > 0
    ).length

    const confianzaPromedio = nominasCompletas / totalNominas

    // 7. Crear patrones de memoria basados en datos reales
    const memoryPatterns = empresaStats.map((empresa, index) => ({
      id: `pattern_${index + 1}`,
      summary: `Patrón específico de ${empresa.empresa}: ${empresa.empleados.length} empleado(s), estructura de nómina con ${topPercepciones.length} tipos de percepciones reconocidas`,
      confidence_score: Math.min(0.95, 0.7 + (empresa.nominas_procesadas / 10) * 0.2),
      usage_count: empresa.nominas_procesadas,
      learned_patterns: {
        empresa: empresa.empresa,
        empleados: empresa.empleados.length,
        conceptos_frecuentes: topPercepciones.slice(0, 3).map(p => p.concepto)
      },
      keywords: [
        empresa.empresa,
        ...topPercepciones.slice(0, 3).map(p => p.concepto),
        ...topDeducciones.slice(0, 2).map(d => d.concepto)
      ],
      extracted_data: {
        company: {
          name: empresa.empresa
        },
        patterns: {
          percepciones: topPercepciones.slice(0, 5),
          deducciones: topDeducciones.slice(0, 5)
        }
      }
    }))

    // Construir respuesta completa
    const memoryStatus = {
      summary: {
        total_processed: totalNominas,
        total_chunks: totalNominas * 7, // Simulado: aprox 7 chunks por nómina
        total_embeddings: totalNominas * 7,
        avg_confidence: confianzaPromedio,
        companies_count: empresasUnicas.length,
        employees_count: empleadosUnicos.length,
        processing_speed: velocidadProcesamiento,
        first_processed: primerProcesamiento.toISOString(),
        last_processed: ultimoProcesamiento.toISOString()
      },
      memory_patterns: memoryPatterns,
      company_analytics: empresaStats,
      pattern_analysis: {
        top_percepciones: topPercepciones,
        top_deducciones: topDeducciones,
        total_concepts_learned: topPercepciones.length + topDeducciones.length
      },
      financial_summary: {
        total_neto_procesado: totalNetoProcessado,
        total_coste_empresa_procesado: totalCosteEmpresaProcessado,
        promedio_neto: promedioNeto,
        promedio_coste_empresa: promedioCosteEmpresa,
        ahorro_estimado_mensual: totalNominas * 3.7, // €3.7 por nómina procesada automáticamente
        tiempo_ahorrado_horas: totalNominas * 0.75 // 45 min por nómina
      },
      system_health: {
        data_completeness: confianzaPromedio,
        pattern_diversity: memoryPatterns.length,
        learning_velocity: velocidadProcesamiento,
        optimization_level: Math.min(0.95, confianzaPromedio + 0.1)
      }
    }

    return NextResponse.json({
      success: true,
      data: memoryStatus,
      timestamp: new Date().toISOString(),
      source: 'supabase_live'
    })

  } catch (error) {
    console.error('Error obteniendo estadísticas en vivo:', error)
    return NextResponse.json({
      success: false,
      error: 'Error interno del servidor',
      details: error instanceof Error ? error.message : 'Error desconocido'
    }, { status: 500 })
  }
} 
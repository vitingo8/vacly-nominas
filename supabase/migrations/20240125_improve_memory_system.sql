-- ========================================
-- MEJORA INTEGRAL DEL SISTEMA DE MEMORIA
-- ========================================

-- Habilitar la extensión vector si no está habilitada
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 1. MEJORAR TABLA document_embeddings
-- ====================================

-- Añadir columna temporal para conversión
ALTER TABLE public.document_embeddings 
ADD COLUMN IF NOT EXISTS embedding_vector vector(512);

-- Convertir los embeddings de texto a vector
-- NOTA: Esto asume que los embeddings están almacenados como arrays JSON
UPDATE public.document_embeddings 
SET embedding_vector = embedding::vector(512)
WHERE embedding IS NOT NULL;

-- Añadir columnas adicionales para mejor gestión
ALTER TABLE public.document_embeddings
ADD COLUMN IF NOT EXISTS chunk_size INTEGER,
ADD COLUMN IF NOT EXISTS token_count INTEGER,
ADD COLUMN IF NOT EXISTS metadata_jsonb JSONB,
ADD COLUMN IF NOT EXISTS chunk_hash TEXT,
ADD COLUMN IF NOT EXISTS processing_model TEXT DEFAULT 'voyage-3';

-- Migrar metadata de texto a JSONB si existe
UPDATE public.document_embeddings
SET metadata_jsonb = CASE 
    WHEN metadata IS NOT NULL AND metadata != '' 
    THEN metadata::jsonb 
    ELSE '{}'::jsonb 
END
WHERE metadata_jsonb IS NULL;

-- Crear índice HNSW para búsquedas vectoriales rápidas
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector 
ON public.document_embeddings 
USING hnsw (embedding_vector vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Índices adicionales para búsquedas eficientes
CREATE INDEX IF NOT EXISTS idx_document_embeddings_company_id 
ON public.document_embeddings(company_id);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_type 
ON public.document_embeddings(document_type_id);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_chunk_hash 
ON public.document_embeddings(chunk_hash);

CREATE INDEX IF NOT EXISTS idx_document_embeddings_metadata 
ON public.document_embeddings USING GIN (metadata_jsonb);


-- 2. MEJORAR TABLA document_memory
-- ================================

-- Añadir embeddings para las memorias
ALTER TABLE public.document_memory
ADD COLUMN IF NOT EXISTS summary_embedding vector(512),
ADD COLUMN IF NOT EXISTS patterns_embedding vector(512),
ADD COLUMN IF NOT EXISTS keywords_array TEXT[],
ADD COLUMN IF NOT EXISTS learned_patterns_jsonb JSONB,
ADD COLUMN IF NOT EXISTS metadata_jsonb JSONB,
ADD COLUMN IF NOT EXISTS processing_model TEXT DEFAULT 'claude-3.5-haiku',
ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS validation_score DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS feedback_score DECIMAL(3,2);

-- Migrar learned_patterns de texto a JSONB
UPDATE public.document_memory
SET learned_patterns_jsonb = CASE 
    WHEN learned_patterns IS NOT NULL AND learned_patterns != '' 
    THEN learned_patterns::jsonb 
    ELSE '{}'::jsonb 
END
WHERE learned_patterns_jsonb IS NULL;

-- Migrar keywords de texto a array
UPDATE public.document_memory
SET keywords_array = string_to_array(keywords, ',')
WHERE keywords IS NOT NULL AND keywords_array IS NULL;

-- Actualizar confidence_score basado en métricas reales
UPDATE public.document_memory
SET confidence_score = CASE
    WHEN usage_count > 10 THEN 0.95
    WHEN usage_count > 5 THEN 0.85
    WHEN usage_count > 2 THEN 0.75
    WHEN usage_count > 0 THEN 0.65
    ELSE 0.50
END
WHERE confidence_score = 0.5;

-- Crear índices para búsquedas vectoriales en memorias
CREATE INDEX IF NOT EXISTS idx_document_memory_summary_vector 
ON public.document_memory 
USING hnsw (summary_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_document_memory_patterns_vector 
ON public.document_memory 
USING hnsw (patterns_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Índices para keywords y búsquedas
CREATE INDEX IF NOT EXISTS idx_document_memory_keywords 
ON public.document_memory USING GIN (keywords_array);

CREATE INDEX IF NOT EXISTS idx_document_memory_patterns 
ON public.document_memory USING GIN (learned_patterns_jsonb);

CREATE INDEX IF NOT EXISTS idx_document_memory_confidence 
ON public.document_memory(confidence_score DESC);


-- 3. NUEVA TABLA: memory_analytics
-- ================================
CREATE TABLE IF NOT EXISTS public.memory_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Métricas de procesamiento
    total_documents_processed INTEGER DEFAULT 0,
    total_chunks_created INTEGER DEFAULT 0,
    total_memories_created INTEGER DEFAULT 0,
    avg_processing_time_ms INTEGER,
    avg_chunk_size INTEGER,
    
    -- Métricas de calidad
    avg_confidence_score DECIMAL(3,2),
    avg_validation_score DECIMAL(3,2),
    avg_feedback_score DECIMAL(3,2),
    
    -- Métricas de uso
    total_searches INTEGER DEFAULT 0,
    total_memory_hits INTEGER DEFAULT 0,
    avg_search_latency_ms INTEGER,
    hit_rate DECIMAL(3,2),
    
    -- Distribución de datos
    chunk_size_distribution JSONB,
    document_type_distribution JSONB,
    confidence_distribution JSONB,
    
    -- Timestamps
    calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_memory_analytics_company_calculated 
ON public.memory_analytics(company_id, calculated_at DESC);


-- 4. NUEVA TABLA: memory_search_logs
-- ==================================
CREATE TABLE IF NOT EXISTS public.memory_search_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    
    -- Información de búsqueda
    query_text TEXT,
    query_embedding vector(512),
    search_type TEXT, -- 'semantic', 'keyword', 'hybrid'
    filters_applied JSONB,
    
    -- Resultados
    results_count INTEGER,
    top_results JSONB, -- Top 5 results with scores
    selected_result_id UUID,
    
    -- Métricas
    search_latency_ms INTEGER,
    embedding_latency_ms INTEGER,
    db_latency_ms INTEGER,
    
    -- Feedback
    was_helpful BOOLEAN,
    user_feedback TEXT,
    
    -- Metadata
    user_id UUID,
    session_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_search_logs_company_created 
ON public.memory_search_logs(company_id, created_at DESC);

CREATE INDEX idx_search_logs_query_vector 
ON public.memory_search_logs 
USING hnsw (query_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);


-- 5. FUNCIONES MEJORADAS PARA BÚSQUEDA SEMÁNTICA
-- ==============================================

-- Función para búsqueda semántica mejorada
CREATE OR REPLACE FUNCTION search_similar_chunks(
    query_embedding vector(512),
    company_id_param UUID,
    limit_param INTEGER DEFAULT 10,
    threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    text_chunk TEXT,
    similarity FLOAT,
    metadata JSONB,
    chunk_index INTEGER,
    document_type TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.id as chunk_id,
        de.document_id,
        de.text_chunk,
        1 - (de.embedding_vector <=> query_embedding) as similarity,
        de.metadata_jsonb as metadata,
        de.chunk_index,
        dt.name as document_type
    FROM document_embeddings de
    LEFT JOIN document_types dt ON de.document_type_id = dt.id
    WHERE de.company_id = company_id_param
        AND de.embedding_vector IS NOT NULL
        AND (1 - (de.embedding_vector <=> query_embedding)) > threshold
    ORDER BY de.embedding_vector <=> query_embedding
    LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;

-- Función para búsqueda de memorias similares
CREATE OR REPLACE FUNCTION search_similar_memories(
    query_embedding vector(512),
    company_id_param UUID,
    limit_param INTEGER DEFAULT 5,
    threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
    memory_id UUID,
    summary TEXT,
    learned_patterns JSONB,
    keywords TEXT[],
    similarity FLOAT,
    confidence_score DECIMAL,
    usage_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dm.id as memory_id,
        dm.summary,
        dm.learned_patterns_jsonb as learned_patterns,
        dm.keywords_array as keywords,
        1 - (dm.summary_embedding <=> query_embedding) as similarity,
        dm.confidence_score,
        dm.usage_count
    FROM document_memory dm
    WHERE dm.company_id = company_id_param
        AND dm.summary_embedding IS NOT NULL
        AND (1 - (dm.summary_embedding <=> query_embedding)) > threshold
    ORDER BY dm.summary_embedding <=> query_embedding
    LIMIT limit_param;
END;
$$ LANGUAGE plpgsql;


-- 6. VISTAS MATERIALIZADAS PARA DASHBOARDS
-- ========================================

CREATE MATERIALIZED VIEW IF NOT EXISTS memory_stats_dashboard AS
SELECT 
    c.id as company_id,
    c.name as company_name,
    COUNT(DISTINCT pd.id) as total_documents,
    COUNT(DISTINCT de.id) as total_chunks,
    COUNT(DISTINCT dm.id) as total_memories,
    AVG(de.chunk_size) as avg_chunk_size,
    AVG(dm.confidence_score) as avg_confidence,
    MAX(pd.created_at) as last_document_processed,
    COUNT(DISTINCT de.document_type_id) as document_types_count,
    ARRAY_AGG(DISTINCT dt.name) as document_types
FROM companies c
LEFT JOIN processed_documents pd ON c.id = pd.company_id
LEFT JOIN document_embeddings de ON c.id = de.company_id
LEFT JOIN document_memory dm ON c.id = dm.company_id
LEFT JOIN document_types dt ON de.document_type_id = dt.id
GROUP BY c.id, c.name;

CREATE UNIQUE INDEX idx_memory_stats_dashboard_company 
ON memory_stats_dashboard(company_id);


-- 7. TRIGGERS PARA ACTUALIZACIONES AUTOMÁTICAS
-- ===========================================

CREATE OR REPLACE FUNCTION update_memory_analytics()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO memory_analytics (
        company_id,
        total_documents_processed,
        total_chunks_created,
        total_memories_created,
        avg_confidence_score,
        calculated_at
    )
    SELECT 
        NEW.company_id,
        COUNT(DISTINCT pd.id),
        COUNT(DISTINCT de.id),
        COUNT(DISTINCT dm.id),
        AVG(dm.confidence_score),
        NOW()
    FROM companies c
    LEFT JOIN processed_documents pd ON c.id = pd.company_id
    LEFT JOIN document_embeddings de ON c.id = de.company_id
    LEFT JOIN document_memory dm ON c.id = dm.company_id
    WHERE c.id = NEW.company_id
    GROUP BY c.id
    ON CONFLICT (company_id) DO UPDATE
    SET 
        total_documents_processed = EXCLUDED.total_documents_processed,
        total_chunks_created = EXCLUDED.total_chunks_created,
        total_memories_created = EXCLUDED.total_memories_created,
        avg_confidence_score = EXCLUDED.avg_confidence_score,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Crear triggers
CREATE TRIGGER trigger_update_analytics_on_document
AFTER INSERT OR UPDATE ON processed_documents
FOR EACH ROW
EXECUTE FUNCTION update_memory_analytics();

CREATE TRIGGER trigger_update_analytics_on_memory
AFTER INSERT OR UPDATE ON document_memory
FOR EACH ROW
EXECUTE FUNCTION update_memory_analytics();


-- 8. POLÍTICAS DE SEGURIDAD (RLS)
-- ===============================

-- Habilitar RLS si no está habilitado
ALTER TABLE document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_memory ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_search_logs ENABLE ROW LEVEL SECURITY;

-- Políticas para document_embeddings
CREATE POLICY "Users can view their company embeddings" ON document_embeddings
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM company_users WHERE company_id = document_embeddings.company_id
    ));

-- Políticas para document_memory
CREATE POLICY "Users can view their company memories" ON document_memory
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM company_users WHERE company_id = document_memory.company_id
    ));

-- Políticas para memory_analytics
CREATE POLICY "Users can view their company analytics" ON memory_analytics
    FOR SELECT USING (auth.uid() IN (
        SELECT user_id FROM company_users WHERE company_id = memory_analytics.company_id
    ));


-- 9. COMENTARIOS Y DOCUMENTACIÓN
-- =============================

COMMENT ON TABLE document_embeddings IS 'Almacena embeddings vectoriales de chunks de documentos para búsqueda semántica';
COMMENT ON COLUMN document_embeddings.embedding_vector IS 'Vector de 512 dimensiones generado por Voyage AI';
COMMENT ON COLUMN document_embeddings.chunk_size IS 'Tamaño del chunk en caracteres';
COMMENT ON COLUMN document_embeddings.token_count IS 'Número de tokens en el chunk';

COMMENT ON TABLE document_memory IS 'Almacena patrones aprendidos y memorias empresariales';
COMMENT ON COLUMN document_memory.summary_embedding IS 'Embedding del resumen para búsqueda semántica';
COMMENT ON COLUMN document_memory.validation_score IS 'Score de validación manual o automática (0-1)';

COMMENT ON TABLE memory_analytics IS 'Métricas y estadísticas del sistema de memoria';
COMMENT ON TABLE memory_search_logs IS 'Logs de búsquedas para análisis y mejora continua'; 
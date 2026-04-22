// ============================================================================
// supabase-client.ts — alias de tipo tolerante para SupabaseClient.
// Se evita importar @supabase/supabase-js directamente para que este paquete
// no dependa de dónde esté instalado el driver; el consumidor (vacly-nominas,
// vacly-app) pasa su propia instancia real en runtime.
// ============================================================================

export type SupabaseClient = any;

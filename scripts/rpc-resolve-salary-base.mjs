#!/usr/bin/env node
/**
 * Llama a PostgREST: POST /rest/v1/rpc/fn_v3_resolve_salary_base
 * (misma RPC que Contratos.tsx).
 *
 * Variables de entorno:
 *   SUPABASE_URL              — ej. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY — recomendado (evita RLS en v3_rrhh_tables al depurar)
 *   o SUPABASE_ANON_KEY       — mismo comportamiento que el navegador con sesión
 *
 * Argumentos opcionales (en orden):
 *   p_doc_id p_province p_grupo p_nivel p_categoria
 *   (p_year se envía siempre como null)
 *
 * Ejemplo (PowerShell):
 *   $env:SUPABASE_URL="https://xxxx.supabase.co"
 *   $env:SUPABASE_SERVICE_ROLE_KEY="eyJ..."
 *   node scripts/rpc-resolve-salary-base.mjs `
 *     e2578bce-872f-4f24-838b-3798d96f6278 Tarragona "Grupo IV" "Nivel 4" "Personal limpiador (limpiador, peón)"
 */

const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(
  /\/$/,
  "",
);
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

const [
  ,
  p_doc_id = "e2578bce-872f-4f24-838b-3798d96f6278",
  p_province = "Tarragona",
  p_grupo = "Grupo IV",
  p_nivel = "Nivel 4",
  p_categoria = "Personal limpiador (limpiador, peón)",
] = process.argv;

if (!base || !key) {
  console.error(
    "Faltan SUPABASE_URL y una clave (SUPABASE_SERVICE_ROLE_KEY o SUPABASE_ANON_KEY).",
  );
  process.exit(1);
}

const payload = {
  p_doc_id,
  p_province: p_province || null,
  p_year: null,
  p_grupo,
  p_nivel: p_nivel || null,
  p_categoria: p_categoria || null,
};

console.log("POST", `${base}/rest/v1/rpc/fn_v3_resolve_salary_base`);
console.log("Body:", JSON.stringify(payload, null, 2));

const res = await fetch(`${base}/rest/v1/rpc/fn_v3_resolve_salary_base`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  },
  body: JSON.stringify(payload),
});

const text = await res.text();
console.log("HTTP", res.status);
try {
  console.log(JSON.stringify(JSON.parse(text), null, 2));
} catch {
  console.log(text);
}

# 🔧 Guía de Manejo de Errores en Vacly Nóminas

## Error: "Faltan datos del documento: textContent o id no disponible"

### 🔍 ¿Por Qué Ocurre?

Este error significa que cuando intentas procesar un documento individual con Claude, falta:
- **`textContent`**: El contenido de texto extraído del PDF
- **`documentId`**: El identificador único del documento

### 📊 Cuándo Ocurre

1. **Primer intento (carga)**: El PDF se divide en páginas
   - ✅ Cada página SIEMPRE debe tener `id` y `textContent`

2. **Reintentos posteriores**: Si haces clic en 🧠 para procesar con Claude
   - ⚠️ Si la página se corrupta o no se guardó correctamente

### ✅ Cómo Está Arreglado (v1.1.0)

#### Frontend (`page.tsx`)

**Cambios realizados:**

```typescript
// 1️⃣ Permitir re-procesamiento de documentos fallidos
if (document.claudeProcessed && document.nominaData) {
  // Solo saltar si AMBAS condiciones son verdaderas (exitoso)
  return
}

// 2️⃣ Validar datos disponibles
if (!document.id) {
  throw new Error('Documento sin ID válido')
}

// 3️⃣ Mensajes de error más claros
alert(`Error procesando documento:\n\n${errorMsg}\n\nIntenta cargar el PDF nuevamente.`)

// 4️⃣ Logs detallados
console.error('❌ Error procesando con Claude:', {
  documentId: document.id,
  error: errorMsg,
  hasTextContent: !!document.textContent  // Ayuda a diagnosticar
})
```

#### Backend (`route.ts`)

**Cambios realizados:**

```typescript
// 1️⃣ Logs informativos al recibir solicitud
console.log('📥 Endpoint process-lux recibió:', {
  hasTextContent: !!body.textContent,
  textLength: body.textContent?.length || 0,
  hasDocumentId: !!body.documentId,
  hasFilename: !!body.filename,
  hasUrl: !!body.url
})

// 2️⃣ Mensajes de error más descriptivos
return NextResponse.json({ 
  error: 'Parámetros inválidos',
  details: 'Se requiere (textContent + documentId) ...',
  received: {
    hasTextContent: !!body.textContent,
    hasDocumentId: !!body.documentId,
    // ... otros campos
  }
}, { status: 400 })
```

### 🎯 Qué Sucede Ahora

#### Escenario 1: Documento Procesado Exitosamente

```
1. Clic en botón 🧠
2. ✅ Sistema verifica: document.claudeProcessed = true Y document.nominaData existe
3. ⏭️ Salta el procesamiento (ya está hecho)
```

#### Escenario 2: Documento NO Procesado

```
1. Clic en botón 🧠
2. ⏳ Valida: document.id existe
3. ⏳ Valida: document.textContent existe
4. 📨 Envía a Claude
5. ✅ Si éxito: Actualiza documento con nominaData
6. ❌ Si error: Muestra mensaje claro + logs detallados
```

#### Escenario 3: Documento Sin TextContent

```
1. Clic en botón 🧠
2. ❌ Detecta: document.textContent está vacío
3. ❌ Muestra: "No hay contenido de texto disponible. 
             Por favor, vuelve a subir el PDF completo."
```

### 🚨 Diagnóstico

Si ves este error, revisa:

#### En Consola del Navegador (F12)

```javascript
// Busca líneas como:
console.error('❌ Error procesando con Claude:', {
  documentId: 'xxxxx',
  error: 'Faltan datos...',
  hasTextContent: false  // ⚠️ Aquí ves si falta textContent
})
```

#### En Terminal del Servidor

```bash
# Busca:
📥 Endpoint process-lux recibió: {
  hasTextContent: false,  # ⚠️ Problema aquí
  textLength: 0,
  hasDocumentId: true,
  ...
}

# O:
✅ Procesando documento individual con Claude
# Esto significa que los datos llegaron correctamente
```

### 🔄 Cómo Resolver

#### Opción 1: Recargar la Página
1. F5 o Ctrl+R para recargar
2. Vuelve a subir el PDF
3. Intenta procesar nuevamente

#### Opción 2: Limpiar y Reintentar
1. Cierra y abre el navegador
2. Sube el PDF nuevamente
3. Clic en 🧠 para procesar

#### Opción 3: Usar Otro PDF
1. Si tienes otro PDF de nómina
2. Prueba con ese
3. Si funciona, el problema era con el primer PDF

### 📝 Información Útil para Reportar Bugs

Si el error persiste, proporciona:

```
1. ✅ Captura de pantalla del error
2. ✅ Logs de consola (F12 → Console)
3. ✅ Nombre del PDF que subiste
4. ✅ Sistema operativo y navegador
5. ✅ Pasos exactos para reproducir
```

### 🔬 Cómo Funciona Internamente

```
Flujo de Datos:
1. Usuario sube PDF
   ↓
2. Backend divide en páginas
   ↓
3. Cada página obtiene id + textContent
   ↓
4. Se devuelven documentos al frontend
   ↓
5. Usuario hace clic en 🧠
   ↓
6. Frontend valida id + textContent
   ↓
7. Envía a /api/process-lux
   ↓
8. Backend procesa con Claude
   ↓
9. Devuelve nominaData
   ↓
10. Frontend actualiza documento
```

### ✨ Mejoras Futuras

- [ ] Reintentos automáticos (3 intentos)
- [ ] Usar modelo más potente si falla Haiku
- [ ] Detectar PDFs corruptos automáticamente
- [ ] UI mejorada para mostrar estado de cada página
- [ ] Opción de re-subir solo una página


